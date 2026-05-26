/**
 * inventory.ts — Fetch the player's owned DCL wearables + resolve on-chain tokenIds.
 *
 * Step 1: Catalyst API → list of URNs with metadata (name, rarity, thumbnail)
 * Step 2: Polygon subgraph → map URN → { tokenId, contractAddress }
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

// ── URLs ──

const CATALYST_URL = 'https://peer.decentraland.org'
const COLLECTIONS_SUBGRAPH = 'https://subgraph.decentraland.org/collections-matic-mainnet'

// ── Fetch ──

export function fetchWearables(): void {
  if (loading || loaded) return

  const player = getPlayer()
  if (!player || player.isGuest) {
    wearables = MOCK_ITEMS.map((m) => ({
      urn: '',
      name: m.name,
      rarity: m.rarity,
      category: 'mock',
      thumbnail: '',
      collection: '',
      tokenId: ''
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
      // ── Step 1: Get owned URNs from Catalyst ──
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

      // ── Step 2: Batch-fetch metadata from content API ──
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
          if (!metaRes.ok) continue
          const entities: any[] = await metaRes.json()
          for (const entity of entities) {
            const meta = entity.metadata || {}
            const name = meta.i18n?.[0]?.text || meta.name || meta.id?.split(':').pop() || 'Wearable'
            const rarity = meta.rarity || 'common'
            const category = meta.data?.category || 'wearable'
            const thumbFile = meta.thumbnail || ''
            let thumbnail = ''
            if (thumbFile && entity.content) {
              const thumbEntry = (entity.content as { file: string; hash: string }[])
                .find((c: { file: string }) => c.file === thumbFile)
              if (thumbEntry) {
                thumbnail = `${CATALYST_URL}/content/contents/${thumbEntry.hash}`
              }
            }
            for (const ptr of (entity.pointers || [])) {
              metadataMap.set(ptr, { name, rarity, category, thumbnail })
            }
          }
        } catch (batchErr) {
          console.log('[Inventory] Metadata batch error:', batchErr)
        }
      }

      // ── Step 3: Get tokenIds from Polygon subgraph ──
      const tokenMap = await fetchTokenIds(address)
      console.log('[Inventory] Resolved', tokenMap.size, 'token IDs from subgraph')

      // ── Step 4: Build wearable list with tokenIds ──
      wearables = []
      for (const entry of ownData) {
        const meta = metadataMap.get(entry.urn)

        // Extract collection address from URN
        const urnMatch = entry.urn.match(/urn:decentraland:matic:collections-v2:(0x[a-fA-F0-9]+):(\d+)/)
        const collection = urnMatch ? urnMatch[1] : ''

        // Look up tokenId from subgraph data
        const tokenInfo = tokenMap.get(entry.urn)

        wearables.push({
          urn: entry.urn,
          name: meta?.name || entry.urn.split(':').pop() || 'Unknown',
          rarity: normalizeRarity(meta?.rarity || 'common'),
          category: meta?.category || 'wearable',
          thumbnail: meta?.thumbnail || '',
          collection: tokenInfo?.contractAddress || collection,
          tokenId: tokenInfo?.tokenId || ''
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
      console.log('[Inventory] Loaded', wearables.length, 'wearables with tokenIds')

    } catch (err) {
      console.error('[Inventory] Failed to fetch wearables:', err)
      error = 'Failed to load wearables'
      loading = false
      wearables = MOCK_ITEMS.map((m) => ({
        urn: '',
        name: m.name,
        rarity: m.rarity,
        category: 'mock',
        thumbnail: '',
        collection: '',
        tokenId: ''
      }))
      loaded = true
    }
  })
}

// ── Subgraph: Resolve tokenIds ──

interface TokenInfo {
  tokenId: string
  contractAddress: string
}

async function fetchTokenIds(address: string): Promise<Map<string, TokenInfo>> {
  const map = new Map<string, TokenInfo>()

  try {
    const query = `{
      nfts(
        where: { owner: "${address.toLowerCase()}", category: "wearable" }
        first: 1000
        orderBy: tokenId
        orderDirection: asc
      ) {
        tokenId
        contractAddress
        urn
      }
    }`

    const res = await fetch(COLLECTIONS_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })

    if (!res.ok) {
      console.log('[Inventory] Subgraph query failed:', res.status)
      return map
    }

    const json: any = await res.json()
    const nfts = json.data?.nfts || []

    for (const nft of nfts) {
      // The subgraph urn is the full token-level URN.
      // The Catalyst URN is the base (item-level) URN.
      // We need to match: subgraph urn starts with catalyst urn.
      // Subgraph urn format: "urn:decentraland:matic:collections-v2:0xCOLL:ITEM_ID"
      // or sometimes with a token suffix.
      // Store by the base URN (without token suffix) — first match wins.
      const baseUrn = nft.urn
      if (!map.has(baseUrn)) {
        map.set(baseUrn, {
          tokenId: nft.tokenId,
          contractAddress: nft.contractAddress
        })
      }
    }
  } catch (err) {
    console.error('[Inventory] Subgraph fetch error:', err)
  }

  return map
}

function normalizeRarity(raw: string): Rarity {
  const lower = raw.toLowerCase()
  if (ALL_RARITIES.includes(lower as Rarity)) return lower as Rarity
  return 'common'
}
