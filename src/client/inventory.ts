/**
 * inventory.ts — Fetch the player's owned DCL wearables from the catalyst API.
 */

import { executeTask } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'
import { OwnedWearable, Rarity, ALL_RARITIES, MOCK_ITEMS } from '../shared/items'

// ── State ──

let wearables: OwnedWearable[] = []
let loading = false
let loaded = false
let error = ''

export function getWearables(): OwnedWearable[] { return wearables }
export function isLoading(): boolean { return loading }
export function isLoaded(): boolean { return loaded }
export function getError(): string { return error }

// ── Fetch ──

const CATALYST_URL = 'https://peer.decentraland.org'

export function fetchWearables(): void {
  if (loading || loaded) return

  const player = getPlayer()
  if (!player || player.isGuest) {
    // Guest players get mock items as wearables
    wearables = MOCK_ITEMS.map((m, i) => ({
      urn: '',
      name: m.name,
      rarity: m.rarity,
      category: 'mock',
      thumbnail: ''
    }))
    loaded = true
    console.log('[Inventory] Guest player — loaded', wearables.length, 'mock items')
    return
  }

  loading = true
  error = ''
  const address = player.userId

  executeTask(async () => {
    try {
      const url = `${CATALYST_URL}/lambdas/collections/wearables-by-owner/${address}`
      console.log('[Inventory] Fetching wearables for', address.slice(0, 8), '...')
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error('HTTP ' + res.status)
      }

      const data: any[] = await res.json()

      wearables = []
      for (const entry of data) {
        // The API returns individual NFTs with their definition
        const def = entry.definition || entry.entity?.metadata || {}
        const name = def.name || def.i18n?.[0]?.text || 'Unknown Wearable'
        const rarity = normalizeRarity(def.rarity || 'common')
        const category = def.data?.category || def.category || 'wearable'
        const thumbnail = def.thumbnail || ''
        const urn = entry.urn || entry.id || ''

        wearables.push({ urn, name, rarity, category, thumbnail })
      }

      // Sort: legendary/mythic/unique first, then by name
      const rarityOrder: Record<string, number> = {
        unique: 0, mythic: 1, legendary: 2, epic: 3, rare: 4, uncommon: 5, common: 6
      }
      wearables.sort((a, b) => {
        const ro = (rarityOrder[a.rarity] ?? 9) - (rarityOrder[b.rarity] ?? 9)
        return ro !== 0 ? ro : a.name.localeCompare(b.name)
      })

      loaded = true
      loading = false
      console.log('[Inventory] Loaded', wearables.length, 'wearables')
    } catch (err) {
      console.error('[Inventory] Failed to fetch wearables:', err)
      error = 'Failed to load wearables'
      loading = false
      // Fallback to mock items
      wearables = MOCK_ITEMS.map((m) => ({
        urn: '',
        name: m.name,
        rarity: m.rarity,
        category: 'mock',
        thumbnail: ''
      }))
      loaded = true
    }
  })
}

function normalizeRarity(raw: string): Rarity {
  const lower = raw.toLowerCase()
  if (ALL_RARITIES.includes(lower as Rarity)) return lower as Rarity
  return 'common'
}
