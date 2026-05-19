/** Shared item types and rarity config used by both server and client. */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'unique'

export const ALL_RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique']

export interface DroppedItem {
  id: string
  name: string
  rarity: Rarity
  urn: string              // wearable URN (empty string for mock items)
  onChainDropId: string    // escrow contract dropId (empty for mock/non-chain drops)
  collection: string       // ERC-721 contract address (empty for mock)
  tokenId: string          // on-chain tokenId (empty for mock)
  x: number
  y: number
  z: number
  dropperId: string
  timestamp: number
}

/** Wearable info as returned by the inventory fetch. */
export interface OwnedWearable {
  urn: string
  name: string
  rarity: Rarity
  category: string
  thumbnail: string
}

/** Mock item pool — used as fallback when wallet wearables can't be fetched. */
export const MOCK_ITEMS: { name: string; rarity: Rarity }[] = [
  { name: 'Common Shoes', rarity: 'common' },
  { name: 'Common Cap', rarity: 'common' },
  { name: 'Common Tee', rarity: 'common' },
  { name: 'Rare Jacket', rarity: 'rare' },
  { name: 'Rare Shades', rarity: 'rare' },
  { name: 'Legendary Hat', rarity: 'legendary' },
  { name: 'Legendary Sword', rarity: 'legendary' },
]

/** Map rarity to card model. Falls back to common for missing rarities. */
export const RARITY_MODELS: Record<string, string> = {
  common: 'models/rarity-bg-common.glb',
  uncommon: 'models/rarity-bg-common.glb',   // TODO: download uncommon model
  rare: 'models/rarity-bg-rare.glb',
  epic: 'models/rarity-bg-rare.glb',          // TODO: download epic model
  legendary: 'models/rarity-bg-legendary.glb',
  mythic: 'models/rarity-bg-legendary.glb',   // TODO: download mythic model
  unique: 'models/rarity-bg-legendary.glb',   // TODO: download unique model
}

export const MAX_DROPPED_ITEMS = 30
