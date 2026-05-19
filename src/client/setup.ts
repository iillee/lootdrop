import { engine } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'
import { Rarity, DroppedItem } from '../shared/items'
import { spawnItemCard, clearAllItems, itemAnimationSystem } from './itemRenderer'

export function setupClient(): void {
  console.log('[Client] Setting up LootDrop client...')

  // Handle new item dropped
  room.onMessage('itemDropped', (data) => {
    console.log('[Client] Item dropped:', data.name)
    spawnItemCard(data.id, data.name, data.rarity as Rarity, data.x, data.y, data.z)
  })

  // Handle full sync (on connect)
  room.onMessage('syncAll', (data) => {
    const items: DroppedItem[] = JSON.parse(data.itemsJson)
    console.log('[Client] Syncing', items.length, 'items')
    clearAllItems()
    for (const item of items) {
      spawnItemCard(item.id, item.name, item.rarity, item.x, item.y, item.z)
    }
  })

  // Handle errors
  room.onMessage('error', (data) => {
    console.log('[Client] Error:', data.message)
  })

  // Bob + spin animation
  engine.addSystem(itemAnimationSystem)
}
