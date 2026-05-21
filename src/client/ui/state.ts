/**
 * UI state management — all mutable UI state lives here.
 * Components read/write through exported functions and variables.
 */
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getRealm } from '~system/Runtime'
import { room } from '../../shared/messages'
import { Rarity, OwnedWearable } from '../../shared/items'
import { getWearables, isLoading, isLoaded, fetchWearables } from '../inventory'
import { parseWearableUrn, executeDeposit, TxStatus } from '../blockchain'
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

/** Add a picked-up item to the first empty hotbar slot, or inventory if hotbar is full. */
export function addItemToInventory(w: OwnedWearable): void {
  // Try hotbar first
  for (let i = 0; i < hotbar.length; i++) {
    if (!hotbar[i]) {
      hotbar[i] = w
      console.log('[UI] Added', w.name, 'to hotbar slot', i)
      return
    }
  }
  // Try inventory
  for (let i = 0; i < inventory.length; i++) {
    if (!inventory[i]) {
      inventory[i] = w
      console.log('[UI] Added', w.name, 'to inventory slot', i)
      return
    }
  }
  // Append to inventory
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

export function openDropConfirm(w: OwnedWearable, hotbarIdx: number): void {
  dropConfirmItem = w
  dropConfirmSlot = hotbarIdx
  showDropConfirm = true
}

export function closeDropConfirm(): void {
  showDropConfirm = false
  dropConfirmItem = null
  dropConfirmSlot = -1
}

export function confirmDrop(): void {
  if (!dropConfirmItem) return
  handleDropItem(dropConfirmItem)
  if (dropConfirmSlot >= 0) hotbar[dropConfirmSlot] = null
  clearSelection()
  closeDropConfirm()
}

// ═══════════════════════════════════════════
// Drop logic
// ═══════════════════════════════════════════

let lastDropTime = 0
let cachedIsPreview: boolean | null = null

async function checkIsPreview(): Promise<boolean> {
  if (cachedIsPreview !== null) return cachedIsPreview
  try {
    const realm = await getRealm({})
    cachedIsPreview = realm.realmInfo?.isPreview ?? false
  } catch {
    cachedIsPreview = false
  }
  return cachedIsPreview
}

function handleDropItem(w: OwnedWearable): void {
  if (!isStateSyncronized()) return
  const now = Date.now()
  if (now - lastDropTime < DROP_COOLDOWN_MS) return
  lastDropTime = now
  showInventory = false

  const parsed = parseWearableUrn(w.urn)

  if (parsed && parsed.chain === 'matic') {
    // Check if we're in preview — skip on-chain flow
    checkIsPreview().then((preview) => {
      if (preview) {
        console.log('[Drop] Preview mode — skipping on-chain deposit, using mock drop')
        room.send('requestDrop', { name: w.name, rarity: w.rarity, urn: w.urn })
        return
      }
      _executeOnChainDrop(w, parsed)
    })
    return
  }

  room.send('requestDrop', { name: w.name, rarity: w.rarity, urn: w.urn })
}

function _executeOnChainDrop(w: OwnedWearable, parsed: { collection: string; itemId: number }): void {
  showTxStatus('approving')
  executeDeposit(
    parsed.collection,
    parsed.itemId,
    (onChainDropId) => {
      showTxStatus('confirmed')
      room.send('confirmDrop', {
        name: w.name,
        rarity: w.rarity,
        urn: w.urn,
        onChainDropId,
        collection: parsed.collection,
        tokenId: ''
      })
      setTimeout(() => showTxStatus('idle'), 3000)
    },
    (error) => {
      showTxStatus('error', error)
      setTimeout(() => showTxStatus('idle'), 5000)
    }
  )
}

// ═══════════════════════════════════════════
// Transaction status
// ═══════════════════════════════════════════

export let txStatusText = ''
export let txStatusColor = Color4.White()
export let txStatusUntil = 0

const TX_STATUS_MESSAGES: Record<string, string> = {
  idle:             '',
  'switching-chain': '⛓️ Switching to Polygon...',
  approving:        '✍️ Approve the transaction in your wallet...',
  depositing:       '📦 Depositing into escrow...',
  claiming:         '🎁 Claiming from escrow...',
  confirmed:        '✅ Transaction confirmed!',
  error:            '❌ Transaction failed',
}

export function showTxStatus(status: TxStatus | string, error?: string): void {
  if (status === 'idle') {
    txStatusUntil = 0
    return
  }
  if (status === 'confirmed') {
    txStatusText = TX_STATUS_MESSAGES['confirmed']
    txStatusColor = Color4.create(0.3, 1, 0.3, 1)
    txStatusUntil = Date.now() + 3000
    return
  }
  if (status === 'error') {
    txStatusText = TX_STATUS_MESSAGES['error'] + (error ? ': ' + error.slice(0, 60) : '')
    txStatusColor = Color4.create(1, 0.3, 0.3, 1)
    txStatusUntil = Date.now() + 5000
    return
  }
  txStatusText = TX_STATUS_MESSAGES[status] || status
  txStatusColor = Color4.create(1, 0.85, 0.3, 1)
  txStatusUntil = Date.now() + 30000
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

// Import here to avoid circular — rarityColor is only used in the notification helper above
import { rarityColor } from './colors'

// ═══════════════════════════════════════════
// Hover tracking
// ═══════════════════════════════════════════

export const hotbarHover: boolean[] = new Array(HOTBAR_SLOTS).fill(false)
export const gridHover: boolean[] = new Array(GRID_COLS * GRID_ROWS).fill(false)
export let hoveredGridItem: OwnedWearable | null = null
export function setHoveredGridItem(w: OwnedWearable | null): void { hoveredGridItem = w }
