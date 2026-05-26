/**
 * LootDrop Relay Server
 *
 * Receives signed requests from the DCL scene, verifies the player's identity
 * via signedFetch auth chain, then submits Polygon transactions using a hot wallet.
 *
 * Endpoints:
 *   POST /drop   — depositFor(owner, collection, tokenId)
 *   POST /claim  — claimFor(picker, dropId)
 *   GET  /health — relay status + wallet balance
 */

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const { ethers } = require('ethers')
const { Authenticator } = require('@dcl/crypto')
const path = require('path')

const app = express()
app.use(cors())

// Capture raw body before JSON parsing (needed for signedFetch verification)
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString()
  }
}))

// ── Config ──

const {
  PRIVATE_KEY,
  ESCROW_ADDRESS,
  POLYGON_RPC = 'https://polygon-rpc.com',
  PORT = 3000
} = process.env

if (!PRIVATE_KEY || !ESCROW_ADDRESS) {
  console.error('Missing PRIVATE_KEY or ESCROW_ADDRESS in .env')
  process.exit(1)
}

// ── Blockchain setup ──

const provider = new ethers.JsonRpcProvider(POLYGON_RPC)
const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

const ESCROW_ABI = [
  'function depositFor(address owner, address collection, uint256 tokenId) external returns (uint256 dropId)',
  'function claimFor(address picker, uint256 dropId) external',
  'function getDrop(uint256 dropId) external view returns (address collection, uint256 tokenId, address dropper, bool active)',
  'function nextDropId() external view returns (uint256)'
]

const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet)

console.log(`[Relay] Hot wallet: ${wallet.address}`)
console.log(`[Relay] Escrow contract: ${ESCROW_ADDRESS}`)

// ── Auth verification ──

/**
 * Extract and verify the DCL signedFetch auth chain from request headers.
 * Returns the player's lowercase wallet address, or null if invalid.
 */
async function verifyDCLAuth(req) {
  try {
    const authChain = []
    for (let i = 0; ; i++) {
      const header = req.headers[`x-identity-auth-chain-${i}`]
      if (!header) break
      authChain.push(JSON.parse(header))
    }

    if (authChain.length === 0) {
      console.warn('[Auth] No auth chain headers found')
      return null
    }

    // Try multiple payload formats — signedFetch format varies by client version
    const rawBody = req.rawBody || JSON.stringify(req.body)
    const payloads = [
      `${req.method.toLowerCase()}:${req.originalUrl}:${rawBody}`,
      `${req.method.toLowerCase()}:${req.url}:${rawBody}`,
      `post:${req.originalUrl}:${rawBody}`,
      rawBody
    ]

    for (const payload of payloads) {
      const result = await Authenticator.validateSignature(payload, authChain, null)
      if (result.ok) {
        console.log('[Auth] Verified with payload format:', payload.slice(0, 50) + '...')
        return authChain[0].payload.toLowerCase()
      }
    }

    console.warn('[Auth] All payload formats failed. Headers:', Object.keys(req.headers).filter(h => h.startsWith('x-identity')).join(', '))
    console.warn('[Auth] Raw body:', rawBody.slice(0, 100))
    return null
  } catch (err) {
    console.error('[Auth] Error:', err.message)
    return null
  }
}

// ── Rate limiting ──

const dropLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 1,
  keyGenerator: (req) => req.playerAddress || req.ip,
  message: { error: 'Too many drops — wait 10 seconds' }
})

const claimLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 1,
  keyGenerator: (req) => req.playerAddress || req.ip,
  message: { error: 'Too many claims — wait 10 seconds' }
})

// ── Auth middleware ──

async function requireAuth(req, res, next) {
  const playerAddress = await verifyDCLAuth(req)
  if (!playerAddress) {
    return res.status(401).json({ error: 'Invalid or missing DCL authentication' })
  }
  req.playerAddress = playerAddress
  next()
}

// ── Endpoints ──

/**
 * POST /drop
 * Body: { collection: string, tokenId: string }
 * Auth: signedFetch headers
 *
 * Calls escrow.depositFor(playerAddress, collection, tokenId)
 * Player must have approved the escrow contract beforehand.
 */
app.post('/drop', requireAuth, dropLimiter, async (req, res) => {
  const { collection, tokenId } = req.body
  const player = req.playerAddress

  if (!collection || !tokenId) {
    return res.status(400).json({ error: 'Missing collection or tokenId' })
  }

  if (!ethers.isAddress(collection)) {
    return res.status(400).json({ error: 'Invalid collection address' })
  }

  console.log(`[Drop] ${player} depositing token ${tokenId} from ${collection}`)

  try {
    const tx = await escrow.depositFor(player, collection, tokenId)
    console.log(`[Drop] Tx submitted: ${tx.hash}`)

    const receipt = await tx.wait()
    console.log(`[Drop] Tx confirmed in block ${receipt.blockNumber}`)

    // Read dropId from nextDropId - 1
    const nextId = await escrow.nextDropId()
    const dropId = Number(nextId) - 1

    console.log(`[Drop] ✅ Success! dropId=${dropId}`)
    res.json({ dropId, txHash: tx.hash })
  } catch (err) {
    console.error(`[Drop] ❌ Failed:`, err.message)

    // Parse common revert reasons
    if (err.message.includes('not approved') || err.message.includes('caller is not token owner')) {
      return res.status(400).json({ error: 'NFT not approved — visit the approval page first' })
    }

    res.status(500).json({ error: 'Transaction failed: ' + (err.reason || err.message) })
  }
})

/**
 * POST /claim
 * Body: { dropId: number }
 * Auth: signedFetch headers
 *
 * Calls escrow.claimFor(playerAddress, dropId)
 */
app.post('/claim', requireAuth, claimLimiter, async (req, res) => {
  const { dropId } = req.body
  const player = req.playerAddress

  if (dropId === undefined || dropId === null) {
    return res.status(400).json({ error: 'Missing dropId' })
  }

  console.log(`[Claim] ${player} claiming dropId ${dropId}`)

  try {
    // Verify the drop is still active
    const drop = await escrow.getDrop(dropId)
    if (!drop.active) {
      return res.status(400).json({ error: 'Drop is no longer active' })
    }

    const tx = await escrow.claimFor(player, dropId)
    console.log(`[Claim] Tx submitted: ${tx.hash}`)

    const receipt = await tx.wait()
    console.log(`[Claim] ✅ Confirmed in block ${receipt.blockNumber}`)

    res.json({ txHash: tx.hash })
  } catch (err) {
    console.error(`[Claim] ❌ Failed:`, err.message)
    res.status(500).json({ error: 'Claim failed: ' + (err.reason || err.message) })
  }
})

/**
 * GET /health
 * Returns relay status, wallet address, and MATIC balance.
 */
app.get('/health', async (_req, res) => {
  try {
    const balance = await provider.getBalance(wallet.address)
    res.json({
      status: 'ok',
      wallet: wallet.address,
      balance: ethers.formatEther(balance) + ' MATIC',
      escrow: ESCROW_ADDRESS
    })
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message })
  }
})

// ── Static files (approval page) ──

app.use(express.static(path.join(__dirname, 'public')))

// ── Start ──

app.listen(PORT, () => {
  console.log(`[Relay] Listening on port ${PORT}`)
})
