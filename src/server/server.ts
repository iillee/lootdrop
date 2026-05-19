import { engine, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Storage } from '@dcl/sdk/server'
import { room } from '../shared/messages'
import { DroppedItem, Rarity, ALL_RARITIES, MAX_DROPPED_ITEMS } from '../shared/items'

// ── Server State ──
let droppedItems: DroppedItem[] = []
let nextId = 1

// Track items currently being picked up (prevent double-claim)
const pendingPickups = new Set<string>()

// ── Setup ──

export async function setupServer(): Promise<void> {
  console.log('[Server] Starting LootDrop server...')

  await loadItems()
  registerHandlers()

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

const PICKUP_DISTANCE = 3

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

  // ── Mock Drop (no on-chain, for testing / guests) ──
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

    if (!name || name.length > 100) {
      room.send('error', { message: 'Invalid item name.' }, { to: [from] })
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
      onChainDropId: '',
      collection: '',
      tokenId: '',
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
      dropperId: item.dropperId,
      onChainDropId: ''
    })

    console.log('[Server] Mock item dropped:', item.name, 'by', from.slice(0, 8))
  })

  // ── On-Chain Drop (client completed deposit, now place the item) ──
  room.onMessage('confirmDrop', (data, context) => {
    if (!context) return
    const from = context.from

    if (droppedItems.length >= MAX_DROPPED_ITEMS) {
      room.send('error', { message: 'Drop zone is full!' }, { to: [from] })
      return
    }

    const name = (data.name || '').trim()
    const rarity = ALL_RARITIES.includes(data.rarity as Rarity) ? data.rarity as Rarity : 'common'
    const urn = (data.urn || '').trim()
    const onChainDropId = (data.onChainDropId || '').trim()
    const collection = (data.collection || '').trim()
    const tokenId = (data.tokenId || '').trim()

    if (!name || !onChainDropId) {
      room.send('error', { message: 'Invalid drop confirmation.' }, { to: [from] })
      return
    }

    // Check for duplicate on-chain dropId
    if (droppedItems.some(i => i.onChainDropId === onChainDropId && onChainDropId !== '')) {
      room.send('error', { message: 'This drop has already been recorded.' }, { to: [from] })
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
      onChainDropId,
      collection,
      tokenId,
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
      dropperId: item.dropperId,
      onChainDropId: item.onChainDropId
    })

    console.log('[Server] ⛓️ On-chain item dropped:', item.name, 'dropId:', onChainDropId, 'by', from.slice(0, 8))
  })

  // ── Pickup Request (server validates proximity, then tells client to claim on-chain) ──
  room.onMessage('requestPickup', (data, context) => {
    if (!context) return
    const from = context.from
    const itemId = data.itemId

    const itemIndex = droppedItems.findIndex(i => i.id === itemId)
    if (itemIndex === -1) {
      room.send('error', { message: 'Item no longer exists.' }, { to: [from] })
      return
    }

    const item = droppedItems[itemIndex]

    // Check if someone else is already claiming this
    if (pendingPickups.has(itemId)) {
      room.send('error', { message: 'Someone else is picking this up.' }, { to: [from] })
      return
    }

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

    // If on-chain item, send approval and wait for client to confirm claim
    if (item.onChainDropId) {
      pendingPickups.add(itemId)
      // Auto-expire the pending pickup after 60s (in case client never confirms)
      setTimeout(() => { pendingPickups.delete(itemId) }, 60000)

      room.send('approvePickup', {
        itemId: item.id,
        onChainDropId: item.onChainDropId
      }, { to: [from] })

      console.log('[Server] Approved pickup for', item.name, '— waiting for on-chain claim by', from.slice(0, 8))
      return
    }

    // Mock item — instant pickup (no on-chain step)
    droppedItems.splice(itemIndex, 1)
    saveItems()

    room.send('itemPickedUp', {
      id: item.id,
      pickerId: from,
      pickerName: from.slice(0, 8),
      itemName: item.name,
      rarity: item.rarity
    })

    console.log('[Server] Mock item picked up:', item.name, 'by', from.slice(0, 8))
  })

  // ── Confirm Pickup (client completed on-chain claim) ──
  room.onMessage('confirmPickup', (data, context) => {
    if (!context) return
    const from = context.from
    const itemId = data.itemId

    const itemIndex = droppedItems.findIndex(i => i.id === itemId)
    if (itemIndex === -1) {
      room.send('error', { message: 'Item no longer exists.' }, { to: [from] })
      return
    }

    const item = droppedItems[itemIndex]

    // Remove from pending and from world
    pendingPickups.delete(itemId)
    droppedItems.splice(itemIndex, 1)
    saveItems()

    room.send('itemPickedUp', {
      id: item.id,
      pickerId: from,
      pickerName: from.slice(0, 8),
      itemName: item.name,
      rarity: item.rarity
    })

    console.log('[Server] ⛓️ On-chain item picked up:', item.name, 'by', from.slice(0, 8))
  })
}

// ── Player Sync ──

const knownPlayers = new Set<string>()

function playerSyncSystem(): void {
  for (const [_entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const addr = identity.address.toLowerCase()
    if (!knownPlayers.has(addr)) {
      knownPlayers.add(addr)
      console.log('[Server] New player connected:', addr.slice(0, 8))
      room.send('syncAll', { itemsJson: JSON.stringify(droppedItems) }, { to: [identity.address] })
    }
  }
}
