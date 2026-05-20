import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { room } from '../shared/messages'
import { Rarity, OwnedWearable } from '../shared/items'
import { getWearables, isLoading, isLoaded, fetchWearables } from './inventory'
import { parseWearableUrn, executeDeposit, TxStatus } from './blockchain'

// ── Rarity colors ──

const RARITY_COLORS: Record<string, Color4> = {
  common: Color4.create(0.7, 0.7, 0.7, 1),
  uncommon: Color4.create(0.4, 0.85, 0.4, 1),
  rare: Color4.create(0.3, 0.5, 1, 1),
  epic: Color4.create(0.65, 0.3, 0.9, 1),
  legendary: Color4.create(1, 0.65, 0, 1),
  mythic: Color4.create(0.9, 0.2, 0.3, 1),
  unique: Color4.create(1, 0.4, 0.7, 1),
}

function rarityColor(r: string): Color4 {
  return RARITY_COLORS[r] || RARITY_COLORS.common
}

// ── Transaction status state ──

let txStatusText = ''
let txStatusColor = Color4.White()
let txStatusUntil = 0

const TX_STATUS_MESSAGES: Record<string, string> = {
  'idle': '',
  'switching-chain': '⛓️ Switching to Polygon...',
  'approving': '✍️ Approve the transaction in your wallet...',
  'depositing': '📦 Depositing into escrow...',
  'claiming': '🎁 Claiming from escrow...',
  'confirmed': '✅ Transaction confirmed!',
  'error': '❌ Transaction failed'
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
  txStatusUntil = Date.now() + 30000 // keep showing until replaced
}

// ── Inventory state ──

const HOTBAR_SLOTS = 10
const GRID_COLS = 10
const GRID_ROWS = 5

let showInventory = false
let lastDropTime = 0
const DROP_COOLDOWN_MS = 2000
let gridScrollOffset = 0 // row offset for grid pagination

// Unified selection: first click selects, second click places
let selSource: 'hotbar' | 'grid' | null = null
let selIndex = -1

function clearSelection(): void {
  selSource = null
  selIndex = -1
}

// The hotbar: 10 slots that persist. null = empty slot.
const hotbar: (OwnedWearable | null)[] = new Array(HOTBAR_SLOTS).fill(null)

// The inventory grid: persistent slots, same as hotbar but larger.
let inventory: (OwnedWearable | null)[] = []
let slotsInitialized = false

/** Auto-fill hotbar with first 10, inventory with the rest. */
function ensureHotbarInit(): void {
  if (slotsInitialized) return
  const wearables = getWearables()
  if (!isLoaded() || wearables.length === 0) return
  slotsInitialized = true

  // First 10 go to hotbar
  for (let i = 0; i < HOTBAR_SLOTS && i < wearables.length; i++) {
    hotbar[i] = wearables[i]
  }

  // Rest go to inventory grid
  const remaining = wearables.slice(HOTBAR_SLOTS)
  // Size inventory to at least fill one page, or enough to hold all items
  const minSlots = Math.max(GRID_COLS * GRID_ROWS, remaining.length)
  inventory = new Array(minSlots).fill(null)
  for (let i = 0; i < remaining.length; i++) {
    inventory[i] = remaining[i]
  }
}

/** Get total number of inventory slots (grows in page increments). */
function getInventorySize(): number {
  const PAGE = GRID_COLS * GRID_ROWS
  return Math.max(PAGE, Math.ceil(inventory.length / PAGE) * PAGE)
}

/** Perform a swap/move between any two slots. */
function swapSlots(srcType: 'hotbar' | 'grid', srcIdx: number, dstType: 'hotbar' | 'grid', dstIdx: number): void {
  const srcArr = srcType === 'hotbar' ? hotbar : inventory
  const dstArr = dstType === 'hotbar' ? hotbar : inventory

  // Ensure inventory array is large enough
  if (dstType === 'grid' && dstIdx >= inventory.length) {
    const newLen = dstIdx + 1
    while (inventory.length < newLen) inventory.push(null)
  }
  if (srcType === 'grid' && srcIdx >= inventory.length) {
    const newLen = srcIdx + 1
    while (inventory.length < newLen) inventory.push(null)
  }

  const temp = dstArr[dstIdx]
  dstArr[dstIdx] = srcArr[srcIdx]
  srcArr[srcIdx] = temp
}

/** Handle clicking any slot (hotbar or grid) — unified two-click system. */
function handleSlotClick(type: 'hotbar' | 'grid', idx: number): void {
  // Clicking the already-selected slot → deselect
  if (selSource === type && selIndex === idx) {
    clearSelection()
    return
  }

  // If something is already selected → perform swap/move
  if (selSource !== null) {
    swapSlots(selSource, selIndex, type, idx)
    clearSelection()
    return
  }

  // Nothing selected → select this slot (items or empty)
  selSource = type
  selIndex = idx
}

function toggleInventory(): void {
  showInventory = !showInventory
  if (showInventory && !isLoaded() && !isLoading()) {
    fetchWearables()
  }
  gridScrollOffset = 0
  clearSelection()
}

// ── Drop confirmation modal state ──

let showDropConfirm = false
let dropConfirmItem: OwnedWearable | null = null
let dropConfirmSlot = -1 // hotbar index to clear after drop

function openDropConfirm(w: OwnedWearable, hotbarIdx: number): void {
  dropConfirmItem = w
  dropConfirmSlot = hotbarIdx
  showDropConfirm = true
}

function closeDropConfirm(): void {
  showDropConfirm = false
  dropConfirmItem = null
  dropConfirmSlot = -1
}

function confirmDrop(): void {
  if (!dropConfirmItem) return
  handleDropItem(dropConfirmItem)
  if (dropConfirmSlot >= 0) hotbar[dropConfirmSlot] = null
  clearSelection()
  closeDropConfirm()
}

function handleDropItem(w: OwnedWearable): void {
  if (!isStateSyncronized()) return
  const now = Date.now()
  if (now - lastDropTime < DROP_COOLDOWN_MS) return
  lastDropTime = now
  showInventory = false

  // Check if this is a Polygon wearable we can transfer on-chain
  const parsed = parseWearableUrn(w.urn)

  if (parsed && parsed.chain === 'matic') {
    // On-chain drop: approve → deposit → confirm to server
    showTxStatus('approving')
    executeDeposit(
      parsed.collection,
      parsed.itemId,
      (onChainDropId) => {
        // Deposit succeeded — tell server to place the item
        showTxStatus('confirmed')
        room.send('confirmDrop', {
          name: w.name,
          rarity: w.rarity,
          urn: w.urn,
          onChainDropId,
          collection: parsed.collection,
          tokenId: '' // server doesn't need this for now
        })
        setTimeout(() => showTxStatus('idle'), 3000)
      },
      (error) => {
        showTxStatus('error', error)
        setTimeout(() => showTxStatus('idle'), 5000)
      }
    )
  } else {
    // Mock drop (Ethereum L1 wearables or no URN — use old flow)
    room.send('requestDrop', { name: w.name, rarity: w.rarity, urn: w.urn })
  }
}

// ── Pickup notification state ──

let notificationText = ''
let notificationColor = Color4.White()
let notificationUntil = 0
const NOTIFICATION_DURATION_MS = 3000

export function showPickupNotification(pickerName: string, itemName: string, rarity: Rarity): void {
  notificationText = `${pickerName} picked up ${itemName}!`
  notificationColor = rarityColor(rarity)
  notificationUntil = Date.now() + NOTIFICATION_DURATION_MS
}

// ── UI Constants ──

const SLOT_SIZE = 64
const SLOT_GAP = 4
const SLOT_RADIUS = 12
const SLOT_BG = Color4.create(0.08, 0.08, 0.1, 0.87)
const SLOT_BG_HOVER = Color4.create(0.16, 0.16, 0.22, 0.92)
const SLOT_BG_SELECTED = Color4.create(0.28, 0.22, 0.08, 0.95)
const SLOT_EMPTY_BG = Color4.create(0.06, 0.06, 0.08, 0.5)
const GRID_SLOT_SIZE = SLOT_SIZE
const GRID_SLOT_GAP = SLOT_GAP

const hotbarHover: boolean[] = new Array(HOTBAR_SLOTS).fill(false)
const gridHover: boolean[] = new Array(GRID_COLS * GRID_ROWS).fill(false)
let hoveredGridItem: OwnedWearable | null = null
let selectedGridSlot = -1  // selected empty grid slot index (for receiving hotbar items)

// ── Shared slot renderer ──

function ItemSlot(props: {
  w: OwnedWearable | null,
  size: number,
  radius: number,
  isSelected: boolean,
  isHovered: boolean,
  bgNormal: Color4,
  bgEmpty: Color4,
  onEnter: () => void,
  onLeave: () => void,
  onDown: () => void,
  keyStr: string,
  slotLabel?: string
}) {
  const { w, size, radius, isSelected, isHovered, bgNormal, bgEmpty, onEnter, onLeave, onDown, slotLabel } = props
  const bg = w
    ? (isSelected ? SLOT_BG_SELECTED : isHovered ? SLOT_BG_HOVER : bgNormal)
    : bgEmpty
  const iconSize = Math.round(size * 0.65)

  return (
    <UiEntity
      uiTransform={{
        width: size, height: size,
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        borderRadius: radius
      }}
      uiBackground={{ color: bg }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={onDown}
    >
      {w && (
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
          {w.thumbnail ? (
            <UiEntity
              uiTransform={{ width: iconSize, height: iconSize }}
              uiBackground={{ textureMode: 'stretch', texture: { src: w.thumbnail } }}
            />
          ) : (
            <Label
              value={w.name.slice(0, 2).toUpperCase()}
              fontSize={Math.round(size * 0.28)}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ width: iconSize, height: iconSize }}
            />
          )}
          {/* Rarity bar */}
          <UiEntity
            uiTransform={{ width: size - 14, height: 3, margin: { top: 1 }, borderRadius: 2 }}
            uiBackground={{ color: rarityColor(w.rarity) }}
          />
        </UiEntity>
      )}
      {/* Selection glow */}
      {isSelected && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: size, height: size, borderRadius: radius }}
          uiBackground={{ color: Color4.create(1, 0.84, 0, 0.18) }}
        />
      )}
      {/* Slot number label */}
      {slotLabel && (
        <Label
          value={slotLabel}
          fontSize={10}
          color={Color4.create(0.45, 0.45, 0.5, 1)}
          uiTransform={{ positionType: 'absolute', position: { top: 2, left: 6 }, width: 14, height: 14 }}
        />
      )}
    </UiEntity>
  )
}

// ── Hotbar (always visible) ──

const Hotbar = () => {
  ensureHotbarInit()

  const hasSelection = selSource === 'hotbar' && selIndex >= 0 && !showInventory && hotbar[selIndex] != null

  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: '100%', height: '100%'
    }}>
    {/* Dismiss backdrop — catches clicks outside the hotbar */}
    {hasSelection && (
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.01) }}
        onMouseDown={() => { clearSelection() }}
      />
    )}
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { bottom: 20 },
      width: '100%',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Hotbar slots */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {Array.from({ length: HOTBAR_SLOTS }).map((_, i) => {
          const isThisSelected = selSource === 'hotbar' && selIndex === i && !showInventory && hotbar[i] != null
          return (
          <UiEntity key={`hb-wrap-${i}`} uiTransform={{
            width: SLOT_SIZE, height: SLOT_SIZE,
            margin: { left: i === 0 ? 0 : SLOT_GAP }
          }}>
            {/* Unified pop-up: extends behind the card with drop button below */}
            {isThisSelected && (
              <UiEntity uiTransform={{
                positionType: 'absolute',
                position: { bottom: 0, left: 0 },
                width: SLOT_SIZE,
                height: SLOT_SIZE + 36,
                flexDirection: 'column', alignItems: 'center',
                padding: { top: 5, left: 4, right: 4 },
                borderRadius: SLOT_RADIUS
              }}
              uiBackground={{ color: Color4.create(0.05, 0.05, 0.08, 0.94) }}
              >
                <UiEntity
                  uiTransform={{ width: SLOT_SIZE - 12, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                  uiBackground={{ color: Color4.create(0.85, 0.2, 0.2, 1) }}
                  onMouseDown={() => {
                    const w = hotbar[i]
                    if (w) openDropConfirm(w, i)
                  }}
                >
                  <Label value="DROP" fontSize={11} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: SLOT_SIZE - 12, height: 26 }} />
                </UiEntity>
              </UiEntity>
            )}
            {ItemSlot({
              w: hotbar[i],
              size: SLOT_SIZE,
              radius: SLOT_RADIUS,
              isSelected: selSource === 'hotbar' && selIndex === i,
              isHovered: hotbarHover[i],
              bgNormal: SLOT_BG,
              bgEmpty: SLOT_EMPTY_BG,
              onEnter: () => { hotbarHover[i] = true; if (showInventory) hoveredGridItem = hotbar[i] || null },
              onLeave: () => { hotbarHover[i] = false; if (showInventory && hoveredGridItem === hotbar[i]) hoveredGridItem = null },
              onDown: () => { handleSlotClick('hotbar', i) },
              keyStr: `hb-${i}`,
              slotLabel: `${i + 1 === 10 ? 0 : i + 1}`
            })}
          </UiEntity>
          )
        })}
      </UiEntity>
    </UiEntity>
    </UiEntity>
  )
}

// ── Full inventory grid (opens above hotbar) ──

const InventoryGrid = () => {
  const loading = isLoading()
  const invSize = getInventorySize()
  const PAGE_SIZE = GRID_COLS * GRID_ROWS // 50
  const totalPages = Math.max(1, Math.ceil(invSize / PAGE_SIZE))
  const currentPage = Math.floor(gridScrollOffset / PAGE_SIZE)
  const visibleItems = inventory.slice(gridScrollOffset, gridScrollOffset + PAGE_SIZE)
  const hasPrev = gridScrollOffset > 0
  const hasNext = gridScrollOffset + PAGE_SIZE < invSize
  const itemCount = inventory.filter(Boolean).length

  const gridWidth = GRID_COLS * GRID_SLOT_SIZE + (GRID_COLS - 1) * GRID_SLOT_GAP + 24 // matches hotbar row width + panel padding

  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <UiEntity uiTransform={{
        width: gridWidth,
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: 10, bottom: 10, left: 12, right: 12 },
        borderRadius: 14
      }}
      uiBackground={{ color: Color4.create(0.06, 0.06, 0.09, 0.94) }}
      >
        {/* Descriptor bar — top of panel */}
        <UiEntity uiTransform={{
          width: '100%',
          height: 32,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: { bottom: 6 },
          padding: { left: 10, right: 4 }
        }}>
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
            {hoveredGridItem ? (
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
                <Label
                  value={hoveredGridItem.name}
                  fontSize={14}
                  color={Color4.White()}
                  textAlign="middle-center"
                  uiTransform={{ height: 20, margin: { right: 10 } }}
                />
                <UiEntity
                  uiTransform={{ width: 8, height: 8, borderRadius: 4, margin: { right: 6 } }}
                  uiBackground={{ color: rarityColor(hoveredGridItem.rarity) }}
                />
                <Label
                  value={hoveredGridItem.rarity.toUpperCase()}
                  fontSize={12}
                  color={rarityColor(hoveredGridItem.rarity)}
                  textAlign="middle-left"
                  uiTransform={{ height: 18 }}
                />
              </UiEntity>
            ) : (
              <Label
                value="Hover over an item to see details · Click to equip"
                fontSize={11}
                color={Color4.create(0.45, 0.45, 0.55, 1)}
                textAlign="middle-center"
                uiTransform={{ height: 18 }}
              />
            )}
          </UiEntity>
          <UiEntity
            uiTransform={{ width: 24, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}
            uiBackground={{ color: Color4.create(0.2, 0.12, 0.12, 0.9) }}
            onMouseDown={() => { showInventory = false }}
          >
            <Label value="✕" fontSize={14} color={Color4.create(1, 0.4, 0.4, 1)} textAlign="middle-center" uiTransform={{ width: 24, height: 24 }} />
          </UiEntity>
        </UiEntity>

        {/* Loading */}
        {loading && (
          <Label value="Loading wearables..." fontSize={13} color={Color4.create(0.5, 0.5, 0.6, 1)} textAlign="middle-center" uiTransform={{ height: 40 }} />
        )}

        {/* Empty */}
        {!loading && itemCount === 0 && (
          <Label value="Inventory empty — unequip items from your hotbar" fontSize={12} color={Color4.create(0.4, 0.4, 0.5, 1)} textAlign="middle-center" uiTransform={{ height: 40 }} />
        )}

        {/* Grid rows */}
        {Array.from({ length: GRID_ROWS }).map((_, row) => (
          <UiEntity key={`grow-${row}`} uiTransform={{ flexDirection: 'row', margin: { top: row === 0 ? 0 : GRID_SLOT_GAP } }}>
            {Array.from({ length: GRID_COLS }).map((_, col) => {
              const localIdx = row * GRID_COLS + col
              const absIdx = gridScrollOffset + localIdx
              const w = localIdx < visibleItems.length ? visibleItems[localIdx] || null : null
              return (
                <UiEntity key={`gs-${row}-${col}`} uiTransform={{ margin: { left: col === 0 ? 0 : GRID_SLOT_GAP } }}>
                  {ItemSlot({
                    w,
                    size: GRID_SLOT_SIZE,
                    radius: 10,
                    isSelected: selSource === 'grid' && selIndex === absIdx,
                    isHovered: gridHover[localIdx] || false,
                    bgNormal: SLOT_BG,
                    bgEmpty: SLOT_EMPTY_BG,
                    onEnter: () => { gridHover[localIdx] = true; hoveredGridItem = w },
                    onLeave: () => { gridHover[localIdx] = false; if (hoveredGridItem === w) hoveredGridItem = null },
                    onDown: () => { handleSlotClick('grid', absIdx) },
                    keyStr: `gs-${row}-${col}`
                  })}
                </UiEntity>
              )
            })}
          </UiEntity>
        ))}

        {/* Pagination row — inside panel */}
        <UiEntity uiTransform={{
          width: '100%',
          height: 30,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          margin: { top: 8 }
        }}>
          <UiEntity
            uiTransform={{ width: 30, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', margin: { right: 12 } }}
            uiBackground={{ color: hasPrev ? SLOT_BG_HOVER : Color4.create(0.06, 0.06, 0.08, 0.3) }}
            onMouseDown={() => { if (hasPrev) { gridScrollOffset = Math.max(0, gridScrollOffset - PAGE_SIZE); hoveredGridItem = null } }}
          >
            <Label value="◀" fontSize={14} color={hasPrev ? Color4.create(0.8, 0.8, 0.9, 1) : Color4.create(0.25, 0.25, 0.3, 1)} textAlign="middle-center" uiTransform={{ width: 30, height: 24 }} />
          </UiEntity>
          <Label
            value={`Page ${currentPage + 1} of ${totalPages}`}
            fontSize={12}
            color={Color4.create(0.6, 0.6, 0.7, 1)}
            textAlign="middle-center"
            uiTransform={{ width: 100, height: 24 }}
          />
          <UiEntity
            uiTransform={{ width: 30, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', margin: { left: 12 } }}
            uiBackground={{ color: hasNext ? SLOT_BG_HOVER : Color4.create(0.06, 0.06, 0.08, 0.3) }}
            onMouseDown={() => { if (hasNext) { gridScrollOffset += PAGE_SIZE; hoveredGridItem = null } }}
          >
            <Label value="▶" fontSize={14} color={hasNext ? Color4.create(0.8, 0.8, 0.9, 1) : Color4.create(0.25, 0.25, 0.3, 1)} textAlign="middle-center" uiTransform={{ width: 30, height: 24 }} />
          </UiEntity>
        </UiEntity>
      </UiEntity>


    </UiEntity>
  )
}

// ── Drop confirmation modal ──

const DropConfirmModal = () => {
  if (!dropConfirmItem) return null
  const w = dropConfirmItem
  const iconSize = 128

  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: '100%', height: '100%',
      justifyContent: 'center', alignItems: 'center'
    }}>
      {/* Backdrop */}
      <UiEntity uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%', height: '100%'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
      onMouseDown={() => { closeDropConfirm() }}
      />
      {/* Modal card */}
      <UiEntity uiTransform={{
        width: 280,
        flexDirection: 'column', alignItems: 'center',
        padding: { top: 20, bottom: 20, left: 20, right: 20 },
        borderRadius: 16
      }}
      uiBackground={{ color: Color4.create(0.08, 0.08, 0.1, 0.96) }}
      >
        {/* Item thumbnail */}
        {w.thumbnail ? (
          <UiEntity
            uiTransform={{ width: iconSize, height: iconSize, borderRadius: 12, margin: { bottom: 12 } }}
            uiBackground={{ textureMode: 'stretch', texture: { src: w.thumbnail } }}
          />
        ) : (
          <UiEntity
            uiTransform={{ width: iconSize, height: iconSize, borderRadius: 12, margin: { bottom: 12 }, justifyContent: 'center', alignItems: 'center' }}
            uiBackground={{ color: Color4.create(0.12, 0.12, 0.15, 1) }}
          >
            <Label value={w.name.slice(0, 2).toUpperCase()} fontSize={40} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: iconSize, height: iconSize }} />
          </UiEntity>
        )}

        {/* Item name */}
        <Label
          value={w.name}
          fontSize={18}
          color={Color4.White()}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: 240, height: 48, margin: { bottom: 4 } }}
        />

        {/* Rarity badge */}
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: 14 } }}>
          <UiEntity
            uiTransform={{ width: 8, height: 8, borderRadius: 4, margin: { right: 6 } }}
            uiBackground={{ color: rarityColor(w.rarity) }}
          />
          <Label
            value={w.rarity.toUpperCase()}
            fontSize={12}
            color={rarityColor(w.rarity)}
            textAlign="middle-left"
            uiTransform={{ height: 16 }}
          />
        </UiEntity>

        {/* Confirmation text */}
        <Label
          value="Are you sure you want"
          fontSize={14}
          color={Color4.create(0.7, 0.7, 0.75, 1)}
          textAlign="middle-center"
          uiTransform={{ width: 240, height: 18 }}
        />
        <Label
          value="to drop this item?"
          fontSize={14}
          color={Color4.create(0.7, 0.7, 0.75, 1)}
          textAlign="middle-center"
          uiTransform={{ width: 240, height: 18, margin: { bottom: 16 } }}
        />

        {/* Drop button */}
        <UiEntity
          uiTransform={{ width: 200, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', margin: { bottom: 8 } }}
          uiBackground={{ color: Color4.create(0.85, 0.2, 0.2, 1) }}
          onMouseDown={() => { confirmDrop() }}
        >
          <Label value="DROP ITEM" fontSize={14} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 200, height: 36 }} />
        </UiEntity>

        {/* Cancel button */}
        <UiEntity
          uiTransform={{ width: 200, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: Color4.create(0.15, 0.15, 0.18, 0.9) }}
          onMouseDown={() => { closeDropConfirm() }}
        >
          <Label value="Cancel" fontSize={13} color={Color4.create(0.6, 0.6, 0.65, 1)} textAlign="middle-center" uiTransform={{ width: 200, height: 32 }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

const LootDropUI = () => {
  const showNotification = Date.now() < notificationUntil
  const showTx = Date.now() < txStatusUntil

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {/* Hotbar — always visible at bottom */}
      <Hotbar />

      {/* Inventory grid — opens above hotbar */}
      {showInventory && <InventoryGrid />}

      {/* Inventory toggle button — bottom right, above hotbar */}
      {!showInventory && (
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { bottom: SLOT_SIZE + 30, right: 20 },
          width: 120, height: 32,
          borderRadius: 10,
          justifyContent: 'center',
          alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0.1, 0.1, 0.14, 0.88) }}
        onMouseDown={toggleInventory}
        >
          <Label value="🎒 INVENTORY" fontSize={12} color={Color4.create(0.75, 0.75, 0.85, 1)} textAlign="middle-center" uiTransform={{ width: 120, height: 32 }} />
        </UiEntity>
      )}

      {/* Transaction status — center of screen */}
      {showTx && (
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { top: '40%' },
          width: '100%',
          height: 50,
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <UiEntity
            uiTransform={{ padding: { top: 8, bottom: 8, left: 16, right: 16 } }}
            uiBackground={{ color: Color4.create(0.05, 0.05, 0.1, 0.9) }}
          >
            <Label
              value={txStatusText}
              fontSize={18}
              color={txStatusColor}
              textAlign="middle-center"
              uiTransform={{ width: 500, height: 30 }}
            />
          </UiEntity>
        </UiEntity>
      )}

      {/* Drop confirmation modal */}
      {showDropConfirm && <DropConfirmModal />}

      {/* Pickup notification — top center */}
      {showNotification && (
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { top: '12%' },
          width: '100%',
          height: 40,
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Label
            value={notificationText}
            fontSize={20}
            color={notificationColor}
            textAlign="middle-center"
            uiTransform={{ width: 500, height: 40 }}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(LootDropUI)
}
