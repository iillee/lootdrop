/**
 * blockchain.ts — Relay-based Polygon escrow interaction for LootDrop.
 *
 * Instead of submitting transactions directly from the player's wallet,
 * we send signed requests to the relay server which submits them via a hot wallet.
 *
 * DROP:   signedFetch → relay /drop → depositFor(owner, collection, tokenId)
 * PICKUP: signedFetch → relay /claim → claimFor(picker, dropId)
 */

import { signedFetch } from '~system/SignedFetch'
import { RELAY_URL } from '../shared/contracts'

function safeParseJson(str: string): any {
  try { return JSON.parse(str) } catch { return { error: str || 'Unknown error' } }
}

// ── Status tracking ──

export type TxStatus = 'idle' | 'approving' | 'depositing' | 'claiming' | 'confirmed' | 'error'
let currentStatus: TxStatus = 'idle'
let currentError = ''

export function getTxStatus(): TxStatus { return currentStatus }
export function getTxError(): string { return currentError }
export function resetTxStatus(): void { currentStatus = 'idle'; currentError = '' }

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

// ── Drop: Relay depositFor ──

export interface DropResult {
  success: boolean
  dropId: number
  error?: string
}

/**
 * Send the drop request to the relay server via signedFetch.
 * The relay calls escrow.depositFor(playerAddress, collection, tokenId).
 *
 * NOTE: The player must have approved the escrow contract for this token
 * beforehand via the approval page.
 */
export async function approveAndDeposit(collection: string, tokenId: string): Promise<DropResult> {
  try {
    currentStatus = 'depositing'
    console.log('[Blockchain] Sending drop to relay:', collection, tokenId)

    const res = await signedFetch({
      url: `${RELAY_URL}/drop`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, tokenId })
      }
    })

    if (!res.ok) {
      const body = res.body ? safeParseJson(res.body) : { error: 'Unknown error' }
      const errMsg = body.error || `Relay returned ${res.status}`

      // If the NFT isn't approved, give a helpful message
      if (errMsg.includes('not approved') || errMsg.includes('approval')) {
        currentStatus = 'error'
        currentError = 'NFT not approved — visit the approval page first'
        return { success: false, dropId: -1, error: currentError }
      }

      currentStatus = 'error'
      currentError = errMsg
      return { success: false, dropId: -1, error: errMsg }
    }

    const data = safeParseJson(res.body)
    console.log('[Blockchain] ✅ Relay drop success! dropId:', data.dropId, 'tx:', data.txHash)

    currentStatus = 'confirmed'
    return { success: true, dropId: data.dropId }

  } catch (err: any) {
    console.error('[Blockchain] Drop relay failed:', err)
    currentStatus = 'error'
    currentError = err.message || 'Relay request failed'
    return { success: false, dropId: -1, error: currentError }
  }
}

// ── Pickup: Relay claimFor ──

export interface ClaimResult {
  success: boolean
  txHash: string
  error?: string
}

/**
 * Send the claim request to the relay server via signedFetch.
 * The relay calls escrow.claimFor(playerAddress, dropId).
 */
export async function claimDrop(dropId: number): Promise<ClaimResult> {
  try {
    currentStatus = 'claiming'
    console.log('[Blockchain] Sending claim to relay, dropId:', dropId)

    const res = await signedFetch({
      url: `${RELAY_URL}/claim`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dropId })
      }
    })

    if (!res.ok) {
      const body = res.body ? safeParseJson(res.body) : { error: 'Unknown error' }
      currentStatus = 'error'
      currentError = body.error || `Relay returned ${res.status}`
      return { success: false, txHash: '', error: currentError }
    }

    const data = safeParseJson(res.body)
    console.log('[Blockchain] ✅ Relay claim success! tx:', data.txHash)

    currentStatus = 'confirmed'
    return { success: true, txHash: data.txHash }

  } catch (err: any) {
    console.error('[Blockchain] Claim relay failed:', err)
    currentStatus = 'error'
    currentError = err.message || 'Relay request failed'
    return { success: false, txHash: '', error: currentError }
  }
}

// ── Network check (no longer needed but kept for API compat) ──

export async function checkNetwork(): Promise<boolean> {
  // With the relay, the player doesn't submit transactions directly,
  // so we don't need to check their network. Always return true.
  return true
}
