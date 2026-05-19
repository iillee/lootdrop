/** Shared item types and rarity config used by both server and client. */

export type Rarity = 'common' | 'rare' | 'legendary'

export interface DroppedItem {
  id: string
  name: string
  rarity: Rarity
  x: number
  y: number
  z: number
  dropperId: string
  timestamp: number
}

/** Mock item pool — random items for the prototype drop button. */
export const MOCK_ITEMS: { name: string; rarity: Rarity }[] = [
  { name: 'Common Shoes', rarity: 'common' },
  { name: 'Common Cap', rarity: 'common' },
  { name: 'Common Tee', rarity: 'common' },
  { name: 'Rare Jacket', rarity: 'rare' },
  { name: 'Rare Shades', rarity: 'rare' },
  { name: 'Legendary Hat', rarity: 'legendary' },
  { name: 'Legendary Sword', rarity: 'legendary' },
]

export const RARITY_MODELS: Record<Rarity, string> = {
  common: 'models/rarity-bg-common.glb',
  rare: 'models/rarity-bg-rare.glb',
  legendary: 'models/rarity-bg-legendary.glb',
}

export const MAX_DROPPED_ITEMS = 30
