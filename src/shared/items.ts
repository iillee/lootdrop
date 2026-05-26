/** Shared item types and rarity config used by both server and client. */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'unique'

export const ALL_RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique']

export interface DroppedItem {
  id: string
  name: string
  rarity: Rarity
  urn: string              // wearable URN (empty string for mock items)
  thumbnail: string        // thumbnail image URL (empty for mock items)
  x: number
  y: number
  z: number
  dropperId: string
  timestamp: number
  dropId: number           // on-chain escrow dropId (-1 = mock/off-chain)
  collection: string       // collection contract address (empty for mock)
  tokenId: string          // ERC-721 tokenId (empty for mock)
  reservedBy: string       // address of player currently claiming (empty = available)
  reservedAt: number       // timestamp of reservation (0 = not reserved)
}

/** Wearable info as returned by the inventory fetch. */
export interface OwnedWearable {
  urn: string
  name: string
  rarity: Rarity
  category: string
  thumbnail: string
  collection: string       // collection contract address (empty for mock)
  tokenId: string          // ERC-721 tokenId (empty for mock)
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

/** Card model used for all dropped items. */
export const CARD_MODEL = 'models/rarity-bg-common.glb'

export const MAX_DROPPED_ITEMS = 30
