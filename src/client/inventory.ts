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
    wearables = MOCK_ITEMS.map((m) => ({
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
      // Step 1: Get owned URNs
      const ownUrl = `${CATALYST_URL}/lambdas/collections/wearables-by-owner/${address}`
      console.log('[Inventory] Fetching wearables for', address.slice(0, 8), '...')
      const ownRes = await fetch(ownUrl)
      if (!ownRes.ok) throw new Error('HTTP ' + ownRes.status)
      const ownData: { urn: string; amount: number }[] = await ownRes.json()

      if (ownData.length === 0) {
        wearables = []
        loaded = true
        loading = false
        console.log('[Inventory] Player owns 0 wearables')
        return
      }

      // Step 2: Batch-fetch metadata from content API (chunks of 50)
      const urns = ownData.map(e => e.urn)
      const metadataMap = new Map<string, { name: string; rarity: string; category: string; thumbnail: string }>()
      const BATCH_SIZE = 50

      for (let i = 0; i < urns.length; i += BATCH_SIZE) {
        const batch = urns.slice(i, i + BATCH_SIZE)
        try {
          const metaRes = await fetch(`${CATALYST_URL}/content/entities/active`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pointers: batch })
          })
          if (!metaRes.ok) {
            console.log('[Inventory] Metadata batch failed:', metaRes.status)
            continue
          }
          const entities: any[] = await metaRes.json()
          for (const entity of entities) {
            const meta = entity.metadata || {}
            const name = meta.i18n?.[0]?.text || meta.name || meta.id?.split(':').pop() || 'Wearable'
            const rarity = meta.rarity || 'common'
            const category = meta.data?.category || 'wearable'
            // Resolve thumbnail filename to content hash URL
            const thumbFile = meta.thumbnail || ''
            let thumbnail = ''
            if (thumbFile && entity.content) {
              const thumbEntry = (entity.content as { file: string; hash: string }[])
                .find((c: { file: string }) => c.file === thumbFile)
              if (thumbEntry) {
                thumbnail = `${CATALYST_URL}/content/contents/${thumbEntry.hash}`
              }
            }
            // Map all pointers to this metadata (URN variants)
            for (const ptr of (entity.pointers || [])) {
              metadataMap.set(ptr, { name, rarity, category, thumbnail })
            }
          }
        } catch (batchErr) {
          console.log('[Inventory] Metadata batch error:', batchErr)
        }
      }

      // Step 3: Build wearable list
      wearables = []
      for (const entry of ownData) {
        const meta = metadataMap.get(entry.urn)
        wearables.push({
          urn: entry.urn,
          name: meta?.name || entry.urn.split(':').pop() || 'Unknown',
          rarity: normalizeRarity(meta?.rarity || 'common'),
          category: meta?.category || 'wearable',
          thumbnail: meta?.thumbnail || ''
        })
      }

      // Sort: rarest first, then by name
      const rarityOrder: Record<string, number> = {
        unique: 0, mythic: 1, legendary: 2, epic: 3, rare: 4, uncommon: 5, common: 6
      }
      wearables.sort((a, b) => {
        const ro = (rarityOrder[a.rarity] ?? 9) - (rarityOrder[b.rarity] ?? 9)
        return ro !== 0 ? ro : a.name.localeCompare(b.name)
      })

      loaded = true
      loading = false
      console.log('[Inventory] Loaded', wearables.length, 'wearables with metadata')
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
