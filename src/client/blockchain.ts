/**
 * blockchain.ts — Real Polygon escrow interaction for LootDrop.
 *
 * DROP:   approve(collection, tokenId) → deposit(collection, tokenId) → dropId
 * PICKUP: claim(dropId) → NFT transfers to caller
 *
 * Requires the player's wallet on Polygon PoS network.
 */

import { createEthereumProvider } from '@dcl/sdk/ethereum-provider'
import { RequestManager, ContractFactory } from 'eth-connect'
import { getPlayer } from '@dcl/sdk/src/players'
import { ESCROW_ADDRESS } from '../shared/contracts'
import { ESCROW_ABI, ERC721_APPROVE_ABI } from '../shared/escrowAbi'

// ── State ──

let requestManager: RequestManager | null = null
let escrowContract: any = null
let playerAddress = ''

export type TxStatus = 'idle' | 'approving' | 'depositing' | 'claiming' | 'confirmed' | 'error'
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

async function getEscrowContract(): Promise<any> {
  if (escrowContract) return escrowContract
  const rm = await ensureProvider()
  const factory = new ContractFactory(rm, ESCROW_ABI)
  escrowContract = await factory.at(ESCROW_ADDRESS)
  return escrowContract
}

async function getErc721Contract(collectionAddress: string): Promise<any> {
  const rm = await ensureProvider()
  const factory = new ContractFactory(rm, ERC721_APPROVE_ABI)
  return factory.at(collectionAddress)
}

// ── URN Parsing ──

export interface ParsedUrn {
  chain: 'matic' | 'ethereum'
  collection: string
  itemId: string
}

export function parseWearableUrn(urn: string): ParsedUrn | null {
  const maticMatch = urn.match(/^urn:decentraland:matic:collections-v2:(0x[a-fA-F0-9]+):(\d+)/)
  if (maticMatch) {
    return { chain: 'matic', collection: maticMatch[1], itemId: maticMatch[2] }
  }
  return null
}

// ── Drop: Approve + Deposit ──

export interface DropResult {
  success: boolean
  dropId: number
  error?: string
}

/**
 * Approve the escrow contract to transfer the NFT, then deposit it.
 * The player will be prompted to sign two transactions.
 *
 * @returns The on-chain dropId on success.
 */
export async function approveAndDeposit(collection: string, tokenId: string): Promise<DropResult> {
  try {
    await ensureProvider()
    if (!playerAddress) {
      return { success: false, dropId: -1, error: 'No wallet connected' }
    }

    const gasPrice = await requestManager!.eth_gasPrice()
    const txOpts = { from: playerAddress, gas: 200000, gasPrice }

    // Step 1: Check if already approved
    currentStatus = 'approving'
    console.log('[Blockchain] Checking approval for token', tokenId, 'on', collection)

    const erc721 = await getErc721Contract(collection)
    const approved: string = await erc721.getApproved(tokenId)

    if (approved.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
      console.log('[Blockchain] Requesting approval...')
      const approveTx = await erc721.approve(ESCROW_ADDRESS, tokenId, txOpts)
      console.log('[Blockchain] Approve tx:', approveTx)

      // Wait a moment for the approval to propagate
      await delay(3000)
    } else {
      console.log('[Blockchain] Already approved')
    }

    // Step 2: Deposit into escrow
    currentStatus = 'depositing'
    console.log('[Blockchain] Depositing token', tokenId, 'from collection', collection)

    const escrow = await getEscrowContract()
    const depositTx = await escrow.deposit(collection, tokenId, txOpts)
    console.log('[Blockchain] Deposit tx:', depositTx)

    // Read the dropId from the contract (nextDropId - 1)
    // Since we just deposited, the latest dropId is nextDropId - 1
    await delay(5000) // wait for tx confirmation
    const nextId: string = await escrow.nextDropId()
    const dropId = parseInt(nextId) - 1

    console.log('[Blockchain] ✅ Deposited! dropId =', dropId)
    currentStatus = 'confirmed'
    return { success: true, dropId }

  } catch (err: any) {
    console.error('[Blockchain] Drop failed:', err)
    currentStatus = 'error'
    currentError = err.message || 'Transaction failed'
    return { success: false, dropId: -1, error: currentError }
  }
}

// ── Pickup: Claim ──

export interface ClaimResult {
  success: boolean
  txHash: string
  error?: string
}

/**
 * Claim a dropped item from the escrow contract.
 * The NFT transfers to the caller.
 */
export async function claimDrop(dropId: number): Promise<ClaimResult> {
  try {
    await ensureProvider()
    if (!playerAddress) {
      return { success: false, txHash: '', error: 'No wallet connected' }
    }

    currentStatus = 'claiming'
    console.log('[Blockchain] Claiming dropId', dropId)

    const gasPrice = await requestManager!.eth_gasPrice()
    const escrow = await getEscrowContract()
    const txHash = await escrow.claim(dropId, {
      from: playerAddress,
      gas: 200000,
      gasPrice
    })

    console.log('[Blockchain] ✅ Claimed! tx:', txHash)
    currentStatus = 'confirmed'
    return { success: true, txHash }

  } catch (err: any) {
    console.error('[Blockchain] Claim failed:', err)
    currentStatus = 'error'
    currentError = err.message || 'Transaction failed'
    return { success: false, txHash: '', error: currentError }
  }
}

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if the player is on Polygon network.
 */
export async function checkNetwork(): Promise<boolean> {
  try {
    const rm = await ensureProvider()
    const chainId = await (rm as any).net_version()
    // Polygon PoS mainnet = 137
    return chainId === '137' || chainId === 137
  } catch {
    return false
  }
}
