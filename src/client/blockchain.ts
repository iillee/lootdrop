/**
 * blockchain.ts — Handles on-chain escrow interactions for real wearable transfers.
 * Only supports Polygon (Matic) collections-v2 wearables.
 */

import { executeTask } from '@dcl/sdk/ecs'
import { createEthereumProvider } from '@dcl/sdk/ethereum-provider'
import { RequestManager, ContractFactory } from 'eth-connect'
import { getPlayer } from '@dcl/sdk/src/players'
import { ESCROW_ABI, ERC721_APPROVE_ABI } from '../shared/escrowAbi'
import { ESCROW_ADDRESS } from '../shared/contracts'

// ── Polygon chain config ──

const POLYGON_CHAIN_ID = '0x89' // 137

// ── State ──

let requestManager: RequestManager | null = null
let playerAddress = ''

export type TxStatus = 'idle' | 'switching-chain' | 'approving' | 'depositing' | 'claiming' | 'confirmed' | 'error'
let currentStatus: TxStatus = 'idle'
let currentError = ''

export function getTxStatus(): TxStatus { return currentStatus }
export function getTxError(): string { return currentError }
export function resetTxStatus(): void { currentStatus = 'idle'; currentError = '' }

// ── Init ──

async function ensureProvider(): Promise<RequestManager> {
  if (requestManager) return requestManager
  const provider = createEthereumProvider()
  requestManager = new RequestManager(provider)
  const player = getPlayer()
  playerAddress = player?.userId || ''
  return requestManager
}

// ── URN Parsing ──

export interface ParsedUrn {
  chain: 'matic' | 'ethereum'
  collection: string
  itemId: number
}

/**
 * Parse a DCL wearable URN into chain, collection address, and itemId.
 * Only Polygon (matic) collections-v2 are supported for transfers.
 */
export function parseWearableUrn(urn: string): ParsedUrn | null {
  // Matic v2: urn:decentraland:matic:collections-v2:0x1234...:3
  const maticMatch = urn.match(/^urn:decentraland:matic:collections-v2:(0x[a-fA-F0-9]+):(\d+)$/)
  if (maticMatch) {
    return { chain: 'matic', collection: maticMatch[1], itemId: parseInt(maticMatch[2]) }
  }
  // Ethereum v1: urn:decentraland:ethereum:collections-v1:collection_name:item_name
  // Not supported for on-chain transfer (different chain than our escrow contract)
  return null
}

// ── Token ID Resolution ──
// DCL collections-v2 encode tokenId as (itemId << 216) | issuedId
// We enumerate the owner's tokens and find one matching the desired itemId.

const ITEM_ID_SHIFT = 216n

function extractItemId(tokenId: bigint): number {
  return Number(tokenId >> ITEM_ID_SHIFT)
}

/**
 * Find the actual on-chain tokenId for a specific itemId owned by the player.
 */
async function resolveTokenId(rm: RequestManager, collection: string, itemId: number): Promise<string | null> {
  const factory = new ContractFactory(rm, [
    {
      inputs: [{ name: 'owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
      name: 'tokenOfOwnerByIndex',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    }
  ] as any)
  const contract = await factory.at(collection) as any

  const balance = await contract.balanceOf(playerAddress)
  const count = typeof balance === 'bigint' ? Number(balance) : parseInt(balance.toString())

  for (let i = 0; i < count; i++) {
    const tokenId = await contract.tokenOfOwnerByIndex(playerAddress, i)
    const tokenBig = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId.toString())
    if (extractItemId(tokenBig) === itemId) {
      return tokenId.toString()
    }
  }
  return null
}

// ── Drop Flow: Approve + Deposit ──

/**
 * Execute the full drop flow:
 * 1. Switch to Polygon (if needed)
 * 2. Approve escrow contract for the specific token
 * 3. Call deposit on escrow
 * Returns the on-chain dropId, or null on failure.
 */
export function executeDeposit(
  collection: string,
  itemId: number,
  onComplete: (onChainDropId: string) => void,
  onError: (error: string) => void
): void {
  currentStatus = 'switching-chain'
  currentError = ''

  executeTask(async () => {
    try {
      const rm = await ensureProvider()

      // Step 1: Switch to Polygon
      try {
        await (rm as any).provider.send('wallet_switchEthereumChain', [{ chainId: POLYGON_CHAIN_ID }])
      } catch (switchErr: any) {
        // Chain not added — try adding it
        if (switchErr?.code === 4902) {
          await (rm as any).provider.send('wallet_addEthereumChain', [{
            chainId: POLYGON_CHAIN_ID,
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com']
          }])
        }
        // If user rejected, the error will propagate
      }

      // Step 2: Resolve tokenId
      currentStatus = 'approving'
      console.log('[Blockchain] Resolving tokenId for item', itemId, 'in', collection)
      const tokenId = await resolveTokenId(rm, collection, itemId)
      if (!tokenId) {
        throw new Error('Could not find this wearable in your wallet')
      }
      console.log('[Blockchain] Found tokenId:', tokenId)

      // Step 3: Approve escrow contract
      console.log('[Blockchain] Requesting approval...')
      const approveFactory = new ContractFactory(rm, ERC721_APPROVE_ABI as any)
      const nftContract = await approveFactory.at(collection) as any
      await nftContract.approve(ESCROW_ADDRESS, tokenId, { from: playerAddress })
      console.log('[Blockchain] Approval confirmed')

      // Step 4: Deposit into escrow
      currentStatus = 'depositing'
      console.log('[Blockchain] Depositing into escrow...')
      const escrowFactory = new ContractFactory(rm, ESCROW_ABI as any)
      const escrow = await escrowFactory.at(ESCROW_ADDRESS) as any
      const tx = await escrow.deposit(collection, tokenId, { from: playerAddress })
      console.log('[Blockchain] Deposit tx:', tx)

      // Step 5: Get the dropId from the transaction receipt/events
      // For now, read nextDropId - 1 as our dropId (since we just incremented it)
      const nextId = await escrow.nextDropId()
      const onChainDropId = (parseInt(nextId.toString()) - 1).toString()
      console.log('[Blockchain] On-chain dropId:', onChainDropId)

      currentStatus = 'confirmed'
      onComplete(onChainDropId)
    } catch (err: any) {
      console.error('[Blockchain] Deposit failed:', err)
      currentStatus = 'error'
      currentError = err?.message || 'Transaction failed'
      onError(currentError)
    }
  })
}

// ── Pickup Flow: Claim ──

/**
 * Call claim on the escrow contract to receive the NFT.
 */
export function executeClaim(
  onChainDropId: string,
  onComplete: () => void,
  onError: (error: string) => void
): void {
  currentStatus = 'switching-chain'
  currentError = ''

  executeTask(async () => {
    try {
      const rm = await ensureProvider()

      // Switch to Polygon
      try {
        await (rm as any).provider.send('wallet_switchEthereumChain', [{ chainId: POLYGON_CHAIN_ID }])
      } catch (switchErr: any) {
        if (switchErr?.code === 4902) {
          await (rm as any).provider.send('wallet_addEthereumChain', [{
            chainId: POLYGON_CHAIN_ID,
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com']
          }])
        }
      }

      // Claim
      currentStatus = 'claiming'
      console.log('[Blockchain] Claiming drop', onChainDropId)
      const escrowFactory = new ContractFactory(rm, ESCROW_ABI as any)
      const escrow = await escrowFactory.at(ESCROW_ADDRESS) as any
      await escrow.claim(parseInt(onChainDropId), { from: playerAddress })
      console.log('[Blockchain] Claim confirmed!')

      currentStatus = 'confirmed'
      onComplete()
    } catch (err: any) {
      console.error('[Blockchain] Claim failed:', err)
      currentStatus = 'error'
      currentError = err?.message || 'Transaction failed'
      onError(currentError)
    }
  })
}

// ── Withdraw Flow: Dropper reclaims ──

export function executeWithdraw(
  onChainDropId: string,
  onComplete: () => void,
  onError: (error: string) => void
): void {
  currentStatus = 'switching-chain'
  currentError = ''

  executeTask(async () => {
    try {
      const rm = await ensureProvider()
      try {
        await (rm as any).provider.send('wallet_switchEthereumChain', [{ chainId: POLYGON_CHAIN_ID }])
      } catch (switchErr: any) {
        if (switchErr?.code === 4902) {
          await (rm as any).provider.send('wallet_addEthereumChain', [{
            chainId: POLYGON_CHAIN_ID,
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com']
          }])
        }
      }

      currentStatus = 'claiming' // reuse status
      const escrowFactory = new ContractFactory(rm, ESCROW_ABI as any)
      const escrow = await escrowFactory.at(ESCROW_ADDRESS) as any
      await escrow.withdraw(parseInt(onChainDropId), { from: playerAddress })

      currentStatus = 'confirmed'
      onComplete()
    } catch (err: any) {
      currentStatus = 'error'
      currentError = err?.message || 'Transaction failed'
      onError(currentError)
    }
  })
}
