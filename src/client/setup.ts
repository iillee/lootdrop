import { engine } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'
import { Rarity, DroppedItem } from '../shared/items'
import { spawnItemCard, removeItemCard, clearAllItems, itemAnimationSystem } from './itemRenderer'
import { showPickupNotification, showTxStatus } from './ui'
import { executeClaim } from './blockchain'

export function setupClient(): void {
  console.log('[Client] Setting up LootDrop client...')

  // Handle new item dropped
  room.onMessage('itemDropped', (data) => {
    console.log('[Client] Item dropped:', data.name, data.onChainDropId ? '(on-chain)' : '(mock)')
    spawnItemCard(data.id, data.name, data.rarity as Rarity, data.x, data.y, data.z, data.onChainDropId || '')
  })

  // Handle item picked up
  room.onMessage('itemPickedUp', (data) => {
    console.log('[Client] Item picked up:', data.itemName, 'by', data.pickerName)
    removeItemCard(data.id)
    showPickupNotification(data.pickerName, data.itemName, data.rarity as Rarity)
  })

  // Handle full sync (on connect)
  room.onMessage('syncAll', (data) => {
    const items: DroppedItem[] = JSON.parse(data.itemsJson)
    console.log('[Client] Syncing', items.length, 'items')
    clearAllItems()
    for (const item of items) {
      spawnItemCard(item.id, item.name, item.rarity, item.x, item.y, item.z, item.onChainDropId || '')
    }
  })

  // Handle pickup approval — server says we're close enough, now do the on-chain claim
  room.onMessage('approvePickup', (data) => {
    console.log('[Client] Pickup approved for item', data.itemId, '— claiming on-chain dropId', data.onChainDropId)
    showTxStatus('claiming')

    executeClaim(
      data.onChainDropId,
      () => {
        // On-chain claim succeeded — tell server
        console.log('[Client] On-chain claim confirmed! Notifying server...')
        showTxStatus('confirmed')
        room.send('confirmPickup', { itemId: data.itemId, onChainDropId: data.onChainDropId })
        setTimeout(() => showTxStatus('idle'), 3000)
      },
      (error) => {
        console.error('[Client] On-chain claim failed:', error)
        showTxStatus('error', error)
        setTimeout(() => showTxStatus('idle'), 5000)
      }
    )
  })

  // Handle errors
  room.onMessage('error', (data) => {
    console.log('[Client] Error:', data.message)
  })

  // Bob + spin animation
  engine.addSystem(itemAnimationSystem)
}
