import { engine, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Storage } from '@dcl/sdk/server'
import { room } from '../shared/messages'
import { DroppedItem, MOCK_ITEMS, MAX_DROPPED_ITEMS } from '../shared/items'

// ── Server State ──
let droppedItems: DroppedItem[] = []
let nextId = 1

// ── Setup ──

export async function setupServer(): Promise<void> {
  console.log('[Server] Starting LootDrop server...')

  // Load persisted items
  await loadItems()

  // Register message handlers
  registerHandlers()

  // Sync all items to newly connecting players
  const safe = (name: string, fn: (dt: number) => void) => (dt: number) => {
    try { fn(dt) } catch (err) { console.error(`[Server] ❌ ${name} error:`, err) }
  }
  engine.addSystem(safe('playerSyncSystem', playerSyncSystem))

  console.log('[Server] LootDrop server ready —', droppedItems.length, 'items loaded')
}

// ── Persistence ──

async function loadItems(): Promise<void> {
  try {
    const data = await Storage.get<string>('lootdrop:items')
    if (data) {
      droppedItems = JSON.parse(data)
      // Set nextId past all existing items
      for (const item of droppedItems) {
        const num = parseInt(item.id.replace('item-', ''))
        if (num >= nextId) nextId = num + 1
      }
      console.log('[Server] Loaded', droppedItems.length, 'persisted items')
    }
  } catch (err) {
    console.error('[Server] Failed to load items:', err)
  }
}

async function saveItems(): Promise<void> {
  try {
    await Storage.set('lootdrop:items', JSON.stringify(droppedItems))
  } catch (err) {
    console.error('[Server] Failed to save items:', err)
  }
}

// ── Helpers ──

const PICKUP_DISTANCE = 3 // meters

/** Get a player's server-side position by wallet address. Returns null if not found. */
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

/** Horizontal distance between two points (ignores Y). */
function horizontalDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

// ── Handlers ──

function registerHandlers(): void {
  // ── Drop ──
  room.onMessage('requestDrop', (_data, context) => {
    if (!context) return
    const from = context.from

    if (droppedItems.length >= MAX_DROPPED_ITEMS) {
      room.send('error', { message: 'Drop zone is full! Max ' + MAX_DROPPED_ITEMS + ' items.' }, { to: [from] })
      return
    }

    const pos = getPlayerPosition(from)
    const px = pos ? pos.x : 16
    const pz = pos ? pos.z : 16

    const mock = MOCK_ITEMS[Math.floor(Math.random() * MOCK_ITEMS.length)]

    const item: DroppedItem = {
      id: 'item-' + nextId++,
      name: mock.name,
      rarity: mock.rarity,
      x: px,
      y: 1.2,
      z: pz,
      dropperId: from,
      timestamp: Date.now()
    }

    droppedItems.push(item)
    saveItems()

    room.send('itemDropped', {
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      x: item.x,
      y: item.y,
      z: item.z,
      dropperId: item.dropperId
    })

    console.log('[Server] Item dropped:', item.name, 'by', from.slice(0, 8), 'at', px.toFixed(1), pz.toFixed(1))
  })

  // ── Pickup ──
  room.onMessage('requestPickup', (data, context) => {
    if (!context) return
    const from = context.from
    const itemId = data.itemId

    // Find the item
    const itemIndex = droppedItems.findIndex(i => i.id === itemId)
    if (itemIndex === -1) {
      room.send('error', { message: 'Item no longer exists.' }, { to: [from] })
      return
    }

    const item = droppedItems[itemIndex]

    // Server-side proximity check
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

    // Remove item
    droppedItems.splice(itemIndex, 1)
    saveItems()

    // Broadcast removal to all clients
    room.send('itemPickedUp', {
      id: item.id,
      pickerId: from,
      pickerName: from.slice(0, 8),
      itemName: item.name,
      rarity: item.rarity
    })

    console.log('[Server] Item picked up:', item.name, 'by', from.slice(0, 8))
  })
}

// ── Player Sync ──
// Track known players and send SYNC_ALL when a new one appears

const knownPlayers = new Set<string>()

function playerSyncSystem(): void {
  for (const [_entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const addr = identity.address.toLowerCase()
    if (!knownPlayers.has(addr)) {
      knownPlayers.add(addr)
      console.log('[Server] New player connected:', addr.slice(0, 8))
      // Send all current items to this player
      room.send('syncAll', { itemsJson: JSON.stringify(droppedItems) }, { to: [identity.address] })
    }
  }
}
