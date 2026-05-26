import { engine, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Storage } from '@dcl/sdk/server'
import { room } from '../shared/messages'
import { DroppedItem, Rarity, ALL_RARITIES, MAX_DROPPED_ITEMS } from '../shared/items'

// ── Server State ──
let droppedItems: DroppedItem[] = []
let nextId = 1

const PICKUP_DISTANCE = 3
const RESERVATION_TIMEOUT_MS = 90_000 // 90 seconds to complete claim tx

// ── Setup ──

export async function setupServer(): Promise<void> {
  console.log('[Server] Starting LootDrop server...')

  await loadItems()
  registerHandlers()

  const safe = (name: string, fn: (dt: number) => void) => (dt: number) => {
    try { fn(dt) } catch (err) { console.error(`[Server] ❌ ${name} error:`, err) }
  }
  engine.addSystem(safe('playerSyncSystem', playerSyncSystem))
  engine.addSystem(safe('reservationCleanup', reservationCleanupSystem))

  console.log('[Server] LootDrop server ready —', droppedItems.length, 'items loaded')
}

// ── Persistence ──

async function loadItems(): Promise<void> {
  try {
    const data = await Storage.get<string>('lootdrop:items:v2')
    if (data) {
      droppedItems = JSON.parse(data)
      for (const item of droppedItems) {
        const num = parseInt(item.id.replace('item-', ''))
        if (num >= nextId) nextId = num + 1
        // Clear stale reservations on load
        item.reservedBy = ''
        item.reservedAt = 0
      }
      console.log('[Server] Loaded', droppedItems.length, 'persisted items (v2)')
    } else {
      // Try migrating from v1
      const v1data = await Storage.get<string>('lootdrop:items')
      if (v1data) {
        const v1items: any[] = JSON.parse(v1data)
        droppedItems = v1items.map(i => ({
          ...i,
          dropId: i.dropId ?? -1,
          collection: i.collection ?? '',
          tokenId: i.tokenId ?? '',
          reservedBy: '',
          reservedAt: 0
        }))
        for (const item of droppedItems) {
          const num = parseInt(item.id.replace('item-', ''))
          if (num >= nextId) nextId = num + 1
        }
        await saveItems()
        console.log('[Server] Migrated', droppedItems.length, 'items from v1 to v2')
      }
    }
  } catch (err) {
    console.error('[Server] Failed to load items:', err)
  }
}

async function saveItems(): Promise<void> {
  try {
    await Storage.set('lootdrop:items:v2', JSON.stringify(droppedItems))
  } catch (err) {
    console.error('[Server] Failed to save items:', err)
  }
}

// ── Helpers ──

function getPlayerPosition(address: string): { x: number; y: number; z: number } | null {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() === address.toLowerCase()) {
      const t = Transform.getOrNull(entity)
      if (t) return { x: t.position.x, y: t.position.y, z: t.position.z }
      break
    }
  }
  return null
}

function horizontalDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

// ── Handlers ──

function registerHandlers(): void {

  // ── Drop ──
  room.onMessage('requestDrop', (data, context) => {
    if (!context) return
    const from = context.from

    if (droppedItems.length >= MAX_DROPPED_ITEMS) {
      room.send('error', { message: 'Drop zone is full! Max ' + MAX_DROPPED_ITEMS + ' items.' }, { to: [from] })
      return
    }

    const name = (data.name || '').trim()
    const rarity = ALL_RARITIES.includes(data.rarity as Rarity) ? data.rarity as Rarity : 'common'
    const urn = (data.urn || '').trim()
    const thumbnail = (data.thumbnail || '').trim()
    const dropId = data.dropId ?? -1
    const collection = (data.collection || '').trim()
    const tokenId = (data.tokenId || '').trim()

    if (!name || name.length > 100) {
      room.send('error', { message: 'Invalid item name.' }, { to: [from] })
      return
    }

    // For real drops, require a valid on-chain dropId
    if (urn && dropId < 0) {
      room.send('error', { message: 'On-chain deposit required for real items.' }, { to: [from] })
      return
    }

    const pos = getPlayerPosition(from)
    const px = pos ? pos.x : 16
    const pz = pos ? pos.z : 16

    const item: DroppedItem = {
      id: 'item-' + nextId++,
      name,
      rarity,
      urn,
      thumbnail,
      x: px,
      y: 1.2,
      z: pz,
      dropperId: from,
      timestamp: Date.now(),
      dropId,
      collection,
      tokenId,
      reservedBy: '',
      reservedAt: 0
    }

    droppedItems.push(item)
    saveItems()

    room.send('itemDropped', {
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      thumbnail: item.thumbnail,
      x: item.x,
      y: item.y,
      z: item.z,
      dropperId: item.dropperId,
      dropId: item.dropId
    })

    const isOnChain = dropId >= 0 ? ' (on-chain #' + dropId + ')' : ' (mock)'
    console.log('[Server] Item dropped:', item.name, 'by', from.slice(0, 8), isOnChain)

    // Update dropper's filtered URN list
    if (urn) {
      const myDroppedUrns = droppedItems
        .filter(i => i.dropperId.toLowerCase() === from.toLowerCase() && i.urn)
        .map(i => i.urn)
      room.send('droppedUrns', { urnsJson: JSON.stringify(myDroppedUrns) }, { to: [from] })
    }
  })

  // ── Pickup Request ──
  // For mock items: instant pickup (no blockchain needed).
  // For real items: reserve the item, send approvePickup, wait for confirmPickup.
  room.onMessage('requestPickup', (data, context) => {
    if (!context) return
    const from = context.from
    const itemId = data.itemId

    const item = droppedItems.find(i => i.id === itemId)
    if (!item) {
      room.send('error', { message: 'Item no longer exists.' }, { to: [from] })
      return
    }

    // Check if already reserved by someone else
    if (item.reservedBy && item.reservedBy.toLowerCase() !== from.toLowerCase()) {
      room.send('error', { message: 'Someone else is picking this up.' }, { to: [from] })
      return
    }

    // Proximity check
    const playerPos = getPlayerPosition(from)
    if (!playerPos) {
      room.send('error', { message: 'Cannot verify your position.' }, { to: [from] })
      return
    }
    const dist = horizontalDistance(playerPos, { x: item.x, z: item.z })
    if (dist > PICKUP_DISTANCE) {
      room.send('error', { message: 'Too far away to pick up.' }, { to: [from] })
      return
    }

    // Mock items: instant pickup (no blockchain)
    if (item.dropId < 0) {
      finalizePickup(item, from)
      return
    }

    // Real items: reserve and send approvePickup
    item.reservedBy = from
    item.reservedAt = Date.now()
    saveItems()

    console.log('[Server] Reserved item', item.name, 'for', from.slice(0, 8), '— awaiting on-chain claim')

    room.send('approvePickup', {
      itemId: item.id,
      dropId: item.dropId,
      itemName: item.name,
      rarity: item.rarity
    }, { to: [from] })
  })

  // ── Confirm Pickup (after on-chain claim) ──
  room.onMessage('confirmPickup', (data, context) => {
    if (!context) return
    const from = context.from
    const itemId = data.itemId

    const item = droppedItems.find(i => i.id === itemId)
    if (!item) {
      room.send('error', { message: 'Item no longer exists.' }, { to: [from] })
      return
    }

    // Verify this player had the reservation
    if (item.reservedBy.toLowerCase() !== from.toLowerCase()) {
      room.send('error', { message: 'You do not have a reservation for this item.' }, { to: [from] })
      return
    }

    console.log('[Server] On-chain claim confirmed for', item.name, 'by', from.slice(0, 8), 'tx:', data.txHash)
    finalizePickup(item, from)
  })
}

function finalizePickup(item: DroppedItem, pickerId: string): void {
  const itemIndex = droppedItems.indexOf(item)
  if (itemIndex === -1) return

  droppedItems.splice(itemIndex, 1)
  saveItems()

  room.send('itemPickedUp', {
    id: item.id,
    pickerId,
    pickerName: pickerId,
    itemName: item.name,
    rarity: item.rarity,
    urn: item.urn,
    thumbnail: item.thumbnail,
    dropId: item.dropId,
    collection: item.collection,
    tokenId: item.tokenId
  })

  console.log('[Server] Item picked up:', item.name, 'by', pickerId.slice(0, 8))
}

// ── Reservation Cleanup ──

let cleanupTimer = 0
function reservationCleanupSystem(dt: number): void {
  cleanupTimer += dt
  if (cleanupTimer < 10) return // check every 10 seconds
  cleanupTimer = 0

  const now = Date.now()
  for (const item of droppedItems) {
    if (item.reservedBy && item.reservedAt > 0) {
      if (now - item.reservedAt > RESERVATION_TIMEOUT_MS) {
        console.log('[Server] Reservation expired for', item.name, '- unreserving')
        item.reservedBy = ''
        item.reservedAt = 0
        saveItems()
      }
    }
  }
}

// ── Player Sync ──

const knownPlayers = new Set<string>()

function playerSyncSystem(): void {
  for (const [_entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const addr = identity.address.toLowerCase()
    if (!knownPlayers.has(addr)) {
      knownPlayers.add(addr)
      console.log('[Server] New player connected:', addr.slice(0, 8))

      // Send only non-reserved items (or items reserved by this player)
      const visibleItems = droppedItems.filter(i =>
        !i.reservedBy || i.reservedBy.toLowerCase() === addr
      )
      room.send('syncAll', { itemsJson: JSON.stringify(visibleItems) }, { to: [identity.address] })

      const myDroppedUrns = droppedItems
        .filter(i => i.dropperId.toLowerCase() === addr && i.urn)
        .map(i => i.urn)
      if (myDroppedUrns.length > 0) {
        room.send('droppedUrns', { urnsJson: JSON.stringify(myDroppedUrns) }, { to: [identity.address] })
      }
    }
  }
}
