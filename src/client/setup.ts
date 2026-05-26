import { engine, executeTask } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'
import { Rarity, DroppedItem } from '../shared/items'
import { spawnItemCard, removeItemCard, clearAllItems, itemAnimationSystem } from './itemRenderer'
import { showPickupNotification, showTxStatus } from './ui'
import { addItemToInventory, removeItemFromInventoryByUrn, confirmDropFromServer, rejectDrop } from './ui/state'
import { fetchWearables, isLoaded, isLoading, getWearables } from './inventory'
import { ensureHotbarInit } from './ui/state'
import { getPlayer } from '@dcl/sdk/src/players'
import { claimDrop } from './blockchain'

export function setupClient(): void {
  console.log('[Client] Setting up LootDrop client...')

  // Poll until player is available, then fetch wearables
  let fetchAttempted = false
  engine.addSystem(() => {
    if (fetchAttempted) return
    const player = getPlayer()
    if (!player) return
    fetchAttempted = true
    if (!isLoaded() && !isLoading()) fetchWearables()
  })

  // Handle new item dropped — server confirmed
  room.onMessage('itemDropped', (data) => {
    console.log('[Client] Item dropped:', data.name, data.dropId >= 0 ? '(on-chain #' + data.dropId + ')' : '(mock)')
    confirmDropFromServer()
    spawnItemCard(data.id, data.name, data.rarity as Rarity, data.x, data.y, data.z, data.thumbnail)
  })

  // Handle item picked up
  room.onMessage('itemPickedUp', (data) => {
    console.log('[Client] Item picked up:', data.itemName, 'by', data.pickerName)
    removeItemCard(data.id)
    showPickupNotification(data.pickerName, data.itemName, data.rarity as Rarity)

    // If we're the picker, add the item to our inventory
    const player = getPlayer()
    if (player && data.pickerId.toLowerCase() === player.userId.toLowerCase()) {
      addItemToInventory({
        urn: data.urn || '',
        name: data.itemName,
        rarity: data.rarity as Rarity,
        category: 'pickup',
        thumbnail: data.thumbnail || '',
        collection: data.collection || '',
        tokenId: data.tokenId || ''
      })
    }
  })

  // Handle server approving a pickup — now do the on-chain claim
  room.onMessage('approvePickup', (data) => {
    console.log('[Client] Pickup approved for', data.itemName, '— claiming on-chain, dropId:', data.dropId)

    showTxStatus('⛓️ Claiming ' + data.itemName + '...')

    executeTask(async () => {
      try {
        const result = await claimDrop(data.dropId)

        if (result.success) {
          showTxStatus('confirmed')
          // Tell server the claim succeeded
          room.send('confirmPickup', { itemId: data.itemId, txHash: result.txHash })
        } else {
          showTxStatus('error', result.error || 'Claim transaction failed')
          console.error('[Client] On-chain claim failed:', result.error)
        }
      } catch (err: any) {
        showTxStatus('error', err.message || 'Claim failed')
        console.error('[Client] Claim error:', err)
      }
    })
  })

  // Handle full sync (on connect)
  room.onMessage('syncAll', (data) => {
    const items: DroppedItem[] = JSON.parse(data.itemsJson)
    console.log('[Client] Syncing', items.length, 'items')
    clearAllItems()
    for (const item of items) {
      spawnItemCard(item.id, item.name, item.rarity, item.x, item.y, item.z, item.thumbnail || '')
    }
  })

  // Handle dropped URNs — filter these from our inventory
  let pendingFilterUrns: string[] = []
  room.onMessage('droppedUrns', (data) => {
    const urns: string[] = JSON.parse(data.urnsJson)
    console.log('[Client] Filtering', urns.length, 'already-dropped items from inventory')
    pendingFilterUrns = urns
    for (const urn of urns) {
      removeItemFromInventoryByUrn(urn)
    }
  })

  // Re-apply filter after inventory loads
  let lastLoadedState = false
  engine.addSystem(() => {
    const nowLoaded = isLoaded()
    if (nowLoaded && !lastLoadedState && pendingFilterUrns.length > 0) {
      ensureHotbarInit()
      for (const urn of pendingFilterUrns) {
        removeItemFromInventoryByUrn(urn)
      }
    }
    lastLoadedState = nowLoaded
  })

  // Handle errors — also reject any pending drop
  room.onMessage('error', (data) => {
    console.log('[Client] Error:', data.message)
    rejectDrop()
    showTxStatus('error', data.message)
  })

  // Bob + spin animation
  engine.addSystem(itemAnimationSystem)
}
