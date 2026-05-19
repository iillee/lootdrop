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
  engine.addSystem(playerSyncSystem)

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

// ── Handlers ──

function registerHandlers(): void {
  room.onMessage('requestDrop', (_data, context) => {
    if (!context) return
    const from = context.from

    // Enforce item cap
    if (droppedItems.length >= MAX_DROPPED_ITEMS) {
      room.send('error', { message: 'Drop zone is full! Max ' + MAX_DROPPED_ITEMS + ' items.' }, { to: [from] })
      return
    }

    // Get player position from server-side PlayerIdentityData
    let px = 16, pz = 16 // fallback to center
    for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      if (identity.address.toLowerCase() === from.toLowerCase()) {
        const t = Transform.getOrNull(entity)
        if (t) {
          px = t.position.x
          pz = t.position.z
        }
        break
      }
    }

    // Pick a random mock item
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

    // Broadcast to all clients
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
