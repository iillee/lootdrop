/**
 * UI state management — all mutable UI state lives here.
 * Components read/write through exported functions and variables.
 */
import { Color4 } from '@dcl/sdk/math'
import { executeTask } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { room } from '../../shared/messages'
import { Rarity, OwnedWearable } from '../../shared/items'
import { getWearables, isLoading, isLoaded, fetchWearables } from '../inventory'
import { approveAndDeposit, checkNetwork } from '../blockchain'
import {
  HOTBAR_SLOTS, GRID_COLS, GRID_ROWS,
  DROP_COOLDOWN_MS, NOTIFICATION_DURATION_MS
} from './constants'

// ═══════════════════════════════════════════
// Selection state
// ═══════════════════════════════════════════

export let selSource: 'hotbar' | 'grid' | null = null
export let selIndex = -1

export function clearSelection(): void {
  selSource = null
  selIndex = -1
}

// ═══════════════════════════════════════════
// Inventory & hotbar slots
// ═══════════════════════════════════════════

export let showInventory = false
export let gridScrollOffset = 0

export const hotbar: (OwnedWearable | null)[] = new Array(HOTBAR_SLOTS).fill(null)
export let inventory: (OwnedWearable | null)[] = []

let slotsInitialized = false

/** Auto-fill hotbar (first 10) and inventory (rest) from fetched wearables. */
export function ensureHotbarInit(): void {
  if (slotsInitialized) return
  const wearables = getWearables()
  if (!isLoaded() || wearables.length === 0) return
  slotsInitialized = true

  for (let i = 0; i < HOTBAR_SLOTS && i < wearables.length; i++) {
    hotbar[i] = wearables[i]
  }

  const remaining = wearables.slice(HOTBAR_SLOTS)
  const minSlots = Math.max(GRID_COLS * GRID_ROWS, remaining.length)
  inventory = new Array(minSlots).fill(null)
  for (let i = 0; i < remaining.length; i++) {
    inventory[i] = remaining[i]
  }
}

export function getInventorySize(): number {
  const PAGE = GRID_COLS * GRID_ROWS
  return Math.max(PAGE, Math.ceil(inventory.length / PAGE) * PAGE)
}

export function swapSlots(
  srcType: 'hotbar' | 'grid', srcIdx: number,
  dstType: 'hotbar' | 'grid', dstIdx: number
): void {
  const srcArr = srcType === 'hotbar' ? hotbar : inventory
  const dstArr = dstType === 'hotbar' ? hotbar : inventory

  if (dstType === 'grid' && dstIdx >= inventory.length) {
    while (inventory.length <= dstIdx) inventory.push(null)
  }
  if (srcType === 'grid' && srcIdx >= inventory.length) {
    while (inventory.length <= srcIdx) inventory.push(null)
  }

  const temp = dstArr[dstIdx]
  dstArr[dstIdx] = srcArr[srcIdx]
  srcArr[srcIdx] = temp
}

/** Unified two-click slot handler: first click selects, second click swaps. */
export function handleSlotClick(type: 'hotbar' | 'grid', idx: number): void {
  if (selSource === type && selIndex === idx) {
    clearSelection()
    return
  }
  if (selSource !== null) {
    swapSlots(selSource, selIndex, type, idx)
    clearSelection()
    return
  }
  selSource = type
  selIndex = idx
}

export function toggleInventory(): void {
  showInventory = !showInventory
  if (showInventory && !isLoaded() && !isLoading()) {
    fetchWearables()
  }
  gridScrollOffset = 0
  clearSelection()
}

/** Remove an item by URN (used when server tells us we've already dropped it). */
export function removeItemFromInventoryByUrn(urn: string): void {
  if (!urn) return
  for (let i = 0; i < hotbar.length; i++) {
    if (hotbar[i] && hotbar[i]!.urn === urn) {
      hotbar[i] = null
      console.log('[UI] Removed dropped item from hotbar slot', i)
      return
    }
  }
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i] && inventory[i]!.urn === urn) {
      inventory[i] = null
      console.log('[UI] Removed dropped item from inventory slot', i)
      return
    }
  }
}

/** Add a picked-up item to the first empty hotbar slot, or inventory if hotbar is full. */
export function addItemToInventory(w: OwnedWearable): void {
  for (let i = 0; i < hotbar.length; i++) {
    if (!hotbar[i]) {
      hotbar[i] = w
      console.log('[UI] Added', w.name, 'to hotbar slot', i)
      return
    }
  }
  for (let i = 0; i < inventory.length; i++) {
    if (!inventory[i]) {
      inventory[i] = w
      console.log('[UI] Added', w.name, 'to inventory slot', i)
      return
    }
  }
  inventory.push(w)
  console.log('[UI] Added', w.name, 'to end of inventory')
}

export function setShowInventory(v: boolean): void { showInventory = v }
export function setGridScrollOffset(v: number): void { gridScrollOffset = v }

// ═══════════════════════════════════════════
// Drop confirmation modal
// ═══════════════════════════════════════════

export let showDropConfirm = false
export let dropConfirmItem: OwnedWearable | null = null
export let dropConfirmSlot = -1
export let dropInProgress = false

export function openDropConfirm(w: OwnedWearable, hotbarIdx: number): void {
  dropConfirmItem = w
  dropConfirmSlot = hotbarIdx
  showDropConfirm = true
}

export function closeDropConfirm(): void {
  if (dropInProgress) return // don't close while tx is pending
  showDropConfirm = false
  dropConfirmItem = null
  dropConfirmSlot = -1
}

export function confirmDrop(): void {
  if (!dropConfirmItem || dropInProgress) return
  const w = dropConfirmItem
  const slotIdx = dropConfirmSlot

  if (!isStateSyncronized()) return
  const now = Date.now()
  if (now - lastDropTime < DROP_COOLDOWN_MS) return
  lastDropTime = now

  // Mock items (no URN): drop immediately, no blockchain
  if (!w.urn) {
    console.log('[UI] Mock drop — no blockchain needed')
    pendingDropSlot = slotIdx
    room.send('requestDrop', {
      name: w.name, rarity: w.rarity, urn: '',
      thumbnail: w.thumbnail || '', dropId: -1,
      collection: '', tokenId: ''
    })
    clearSelection()
    showDropConfirm = false
    dropConfirmItem = null
    dropConfirmSlot = -1
    showInventory = false
    return
  }

  // Real item but missing tokenId — can't do on-chain deposit
  if (!w.collection || !w.tokenId) {
    showTxStatus('error', 'Missing token data — try reopening inventory')
    console.error('[UI] Real item missing blockchain data:', w.urn, 'collection:', w.collection, 'tokenId:', w.tokenId)
    return
  }

  // Real item: on-chain approve + deposit flow
  dropInProgress = true
  showTxStatus('⛓️ Approve NFT transfer in your wallet...')

  executeTask(async () => {
    try {
      const result = await approveAndDeposit(w.collection, w.tokenId)

      if (result.success) {
        showTxStatus('confirmed')
        console.log('[UI] On-chain deposit success, dropId:', result.dropId)

        pendingDropSlot = slotIdx
        room.send('requestDrop', {
          name: w.name, rarity: w.rarity, urn: w.urn,
          thumbnail: w.thumbnail || '', dropId: result.dropId,
          collection: w.collection, tokenId: w.tokenId
        })

        clearSelection()
        showDropConfirm = false
        dropConfirmItem = null
        dropConfirmSlot = -1
        showInventory = false
      } else {
        showTxStatus('error', result.error || 'Deposit failed')
      }
    } catch (err: any) {
      showTxStatus('error', err.message || 'Transaction failed')
    } finally {
      dropInProgress = false
    }
  })
}

// ═══════════════════════════════════════════
// Drop timing & pending confirmation
// ═══════════════════════════════════════════

let lastDropTime = 0

/** Hotbar slot waiting for server confirmation. Cleared on itemDropped or error. */
export let pendingDropSlot = -1

/** Called when server confirms the drop — NOW remove from hotbar. */
export function confirmDropFromServer(): void {
  if (pendingDropSlot >= 0) {
    hotbar[pendingDropSlot] = null
    console.log('[UI] Server confirmed drop — cleared hotbar slot', pendingDropSlot)
    pendingDropSlot = -1
  }
}

/** Called when server rejects the drop — keep the item. */
export function rejectDrop(): void {
  if (pendingDropSlot >= 0) {
    console.log('[UI] Server rejected drop — keeping hotbar slot', pendingDropSlot)
    pendingDropSlot = -1
  }
}

// ═══════════════════════════════════════════
// Transaction status
// ═══════════════════════════════════════════

export let txStatusText = ''
export let txStatusColor = Color4.White()
export let txStatusUntil = 0

export function showTxStatus(status: string, error?: string): void {
  if (status === 'idle') {
    txStatusUntil = 0
    return
  }
  if (status === 'confirmed') {
    txStatusText = '✅ Transaction confirmed!'
    txStatusColor = Color4.create(0.3, 1, 0.3, 1)
    txStatusUntil = Date.now() + 3000
    return
  }
  if (status === 'error') {
    txStatusText = '❌ ' + (error || 'Transaction failed')
    txStatusColor = Color4.create(1, 0.3, 0.3, 1)
    txStatusUntil = Date.now() + 5000
    return
  }
  // In-progress status
  txStatusText = status
  txStatusColor = Color4.create(1, 0.85, 0.3, 1)
  txStatusUntil = Date.now() + 120000 // long timeout for pending txs
}

// ═══════════════════════════════════════════
// Pickup notifications
// ═══════════════════════════════════════════

export let notificationText = ''
export let notificationColor = Color4.White()
export let notificationUntil = 0

export function showPickupNotification(pickerName: string, itemName: string, rarity: Rarity): void {
  notificationText = `${pickerName} picked up ${itemName}!`
  notificationColor = Color4.create(
    ...([rarityColor(rarity)].map(c => [c.r, c.g, c.b, c.a])[0] as [number, number, number, number])
  )
  notificationUntil = Date.now() + NOTIFICATION_DURATION_MS
}

import { rarityColor } from './colors'

// ═══════════════════════════════════════════
// Hover tracking
// ═══════════════════════════════════════════

export const hotbarHover: boolean[] = new Array(HOTBAR_SLOTS).fill(false)
export const gridHover: boolean[] = new Array(GRID_COLS * GRID_ROWS).fill(false)
export let hoveredGridItem: OwnedWearable | null = null
export function setHoveredGridItem(w: OwnedWearable | null): void { hoveredGridItem = w }
