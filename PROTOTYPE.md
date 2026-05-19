# LootDrop — Prototype Plan

## Goal

Build a single Decentraland SDK7 scene that demonstrates the core mechanic:

> **A player drops a DCL wearable. It appears as a persistent 3D object in the world. Another player walks up and picks it up. It's now theirs.**

This is the minimum viable magic. If this feels good, everything else follows.

---

## What the Prototype Proves

1. **Digital assets can be physical** — an NFT exists as a tangible object in 3D space
2. **Persistence works** — the item stays after the dropper leaves
3. **Transfer works** — picking up actually moves the asset to the new owner
4. **It feels magical** — the experience is intuitive and exciting

---

## Scope & Constraints

- **Single scene** (2x2 parcels, 32m x 32m) — not world-scale yet
- **DCL wearables only** — L2 Polygon, low gas, existing metadata with thumbnails
- **Authoritative server** for persistence (SDK7 server runtime)
- **Simulated drops first** — before real on-chain transfers, we test with mock items to nail the UX
- **No reputation system yet** — any player can drop/pickup in the prototype

---

## Architecture

```
┌────────────────────────┐
│    CLIENT (Scene)      │
│  • Renders dropped     │
│    items as 3D objects │
│  • Drop UI (select     │
│    item from wallet)   │
│  • Pickup interaction  │
│    (walk up, press E)  │
│  • Visual feedback     │
│    (glow, particles)   │
└──────────┬─────────────┘
           │ messages
┌──────────▼─────────────┐
│  SERVER (Authoritative) │
│  • Tracks dropped items │
│    (position, owner,    │
│     metadata, timestamp)│
│  • Validates drops      │
│  • Validates pickups    │
│  • Persistence via      │
│    Storage API          │
└─────────────────────────┘
```

---

## Build Steps

### Step 1 — Scene Setup ✅ COMPLETE
- Scaffolded SDK7 project (2x2 parcels)
- Dark stone plaza with central drop zone (glowing circular platform)
- Corner pillars with blue light orbs as boundary markers
- Welcome billboard: "LOOTDROP — Drop Items. Find Items. Keep Items."
- 3 mock dropped items (legendary/rare/common) with rarity cards, glow, bob + spin animation
- Downloaded rarity-bg card models from catalog (common, rare, legendary)

**Notes from build:**
- Used primitive meshes for environment (floor, pillars, rings) — keeps it lightweight
- Rarity card GLBs from the catalog work well as item bases at 0.8 scale
- Bob + spin system runs per-frame, feels good at `sin(time*2) * 0.15` amplitude
- Billboard labels on items ensure readability from any angle

**Concerns:**
- Cylinder primitives don't render as perfect circles — they're low-poly cylinders.
  The drop zone ring might look more hexagonal than circular. May want to swap to
  a proper circular GLB model later, or just accept it for prototype.
- No sound yet — the space feels a bit lifeless. Adding ambient audio early
  (Step 2 or 3) would help the "feel" a lot.

---

### Step 2 — Mock Item Drop System ✅ COMPLETE
- Installed `@dcl/sdk@auth-server` (required for isServer, registerMessages, Storage)
- Enabled `authoritativeMultiplayer: true` in scene.json
- Split codebase into `shared/`, `server/`, `client/` structure
- Shared: message schemas (requestDrop, itemDropped, syncAll, error) + item types
- Server: validates drops, reads player position via PlayerIdentityData, persists
  items to Storage, broadcasts to all clients, syncs on player connect
- Client: message handlers spawn/remove card entities, bob+spin animation system
- UI: "DROP ITEM" button (bottom-right) with 2s cooldown, sends requestDrop
- Item data: `{ id, name, rarity, x, y, z, dropperId, timestamp }`
- 30 item cap enforced server-side
- Stripped Step 1 environment (floor, pillars, drop zone, sign) — cards only now

**Notes from build:**
- Used flagtag project as reference for auth server patterns — same SDK branch,
  same registerMessages/isServer/Storage APIs
- Server reads real player position via `PlayerIdentityData` + `Transform` — no
  client-reported positions, anti-cheat by default
- Storage API is flat (`Storage.get`/`Storage.set`), not `Storage.world.get` as
  the skill docs suggested — verified against flagtag's persistence.ts
- Each item = 2 entities (card + front label). Reduced from 4 in Step 1 (removed
  glow sphere and back label). At 2 entities/item, 30 item cap = 60 entities.
- Static import of `./shared/messages` in index.ts is critical — schemas must
  register before the engine seals. Dynamic import would break registerMessages.
- CRDT files (main.crdt) must be deleted when switching to auth-server mode,
  otherwise you get "Outside of bounds" errors.

**Concerns:**
- The scene is empty until you drop something — no environment, no instructions.
  New visitors won't know what to do. Need at minimum a welcome sign or floor
  before Step 3. Could also add back a simple ground plane.
- DROP ITEM button visibility: haven't confirmed it renders in Creator Hub preview
  yet. React-ECS UI can sometimes not appear if the auth server connection isn't
  fully established (isStateSyncronized check gates the send, but UI renders always).
- No visual/audio feedback on drop — item just silently appears. Step 6 polish
  should add a drop sound + brief glow burst.
- Player sync system uses a Set to track known players, but never removes them.
  If a player disconnects and reconnects, they won't get a fresh syncAll. Fine
  for prototype since items don't change while offline, but worth noting.

---

### Step 3 — Mock Item Pickup ✅ COMPLETE
- Player walks near an item → pointer event appears ("Press E to pick up [item name]")
- Client sends `requestPickup` with item ID → server validates (proximity check) → removes item → broadcasts
- Server-side proximity check at 3m (horizontal distance, ignores Y)
- Client pointer event `maxDistance: 4` (slightly generous to avoid frustrating near-misses)
- Pickup notification banner at top-center for 3s, rarity-colored text
- Server removes item from state array, persists, broadcasts `itemPickedUp` to all clients
- Client removes entity + label + pointer event on pickup
- FIFO for simultaneous pickups: first valid request wins, others get "Item no longer exists"

**Notes from build:**
- Went with server-side proximity using `PlayerIdentityData` + `Transform` (option 2
  from original concerns). The server already reads player positions for drops, so
  reusing the same pattern for pickup was trivial. No client-reported positions needed.
- Extracted `getPlayerPosition()` and `horizontalDistance()` helpers in server.ts —
  both drop and pickup logic use them now.
- Added `safe()` wrapper on server systems (from flagtag pattern) for crash resilience.
- Instant pickup + text notification. No fly animation yet (Step 6 polish).
- `showPickupNotification()` exported from ui.tsx and called by setup.ts on
  `itemPickedUp` message — keeps UI state simple (module-level variables, no React state).

**Concerns:**
- Notification text uses `from.slice(0, 8)` as player name (wallet prefix). No name
  resolution yet — would need a `registerName` message like flagtag has. Low priority
  for prototype but looks ugly with hex addresses.
- No sound on pickup. The moment feels flat — just text appearing. Adding a pickup
  sound in Step 6 would help a lot.
- Pointer event hover text rotates with the card (bob+spin animation). This means
  the hover hitbox is a spinning target. In practice it's fine because the collider
  is generous, but could feel odd. If it becomes a problem, could parent the collider
  to a non-rotating wrapper entity.
- `clearAllItems()` in the syncAll handler calls `removeItemCard()` per item, which
  calls `pointerEventsSystem.removeOnPointerDown()` per entity. If syncAll fires with
  many items, this is a burst of removes + adds. Fine for 30 items, but worth noting.

---

### Step 4 — Persistence
- Use SDK7 authoritative server Storage API to save/load dropped items
- Items survive scene restarts and player disconnections
- On scene load, server sends all current items to connecting clients

**Concerns:**
- Storage API: need to confirm the exact API. It should be available via
  `import { Storage } from '~system/Storage'` on the server side.
- Storage is key-value. Strategy: store a single JSON blob of all items under
  one key, or store each item under its own key? Single blob is simpler but
  could hit size limits with many items. Individual keys are more robust.
  → Start with single blob (`lootdrop:items` → JSON array), switch if needed.
- What happens if server crashes mid-write? Could lose data. For prototype
  this is acceptable. For production, need write-ahead logging or similar.
- Time decay: not implementing yet, but the `timestamp` field in the data
  structure is there so we can add it later.

---

### Step 5 — Wallet Integration (Real Items)
- Read player's DCL wearables via API
- Drop UI shows actual owned wearables
- Picking up triggers a real on-chain transfer (or escrow contract call)
- This is the "it's real" moment

**Concerns:**
- **This is the hardest step.** Reading wearables is doable (Decentraland API / 
  The Graph query). But TRANSFERRING wearables requires:
  1. A smart contract that can escrow and release wearables
  2. The dropper signing a transaction to approve + transfer to escrow
  3. The picker signing a transaction to claim from escrow (and paying gas)
  4. Handling the case where a transfer fails (item stuck in escrow)
- Alternative: use signedFetch to call a backend that manages transfers.
  Less decentralized but simpler for prototype.
- **May want to split this into 5a (read wearables, display real inventory)
  and 5b (actual transfers).** 5a alone is valuable — seeing your real items
  in a drop UI is exciting even if the transfer is simulated.
- DCL wearables are ERC-721 on Polygon (Matic). Transfer = `safeTransferFrom`.
  Could use a simple escrow contract: dropper approves + deposits, picker claims.

---

### Step 6 — Polish & Presentation
- Item glow/particle effects based on rarity
- Sound effects for drop and pickup
- Announcement text when items are dropped ("Someone dropped a Rare item!")
- Simple leaderboard or activity feed UI
- Scene description and instructions for new visitors

**Concerns:**
- SDK7 doesn't have a particle system. "Sparkle effects" would need to be
  simulated with multiple small emissive spheres + tweens. Could be expensive
  on entity count. May skip particles and rely on glow + sound + UI text.
- Activity feed UI (React-ECS): showing a scrolling log of "Player X dropped
  Legendary Hat" / "Player Y picked up Rare Jacket" would add a lot of life.
  This is probably the highest-value polish item.
- Ambient sound: a low hum or atmospheric loop would make the space feel alive.
  Should add this early (even in Step 2).

---

## Item Representation (Visual)

For the prototype, dropped items are:
- **Rarity card model** (rarity-bg-*.glb from catalog) as the base — 1x1m flat panels
- **Glow sphere** behind the card — emissive, semi-transparent, color matched to rarity
- **Gentle bob + spin animation** (system-driven, sin wave + rotation)
- **Billboard labels** — item name + rarity tag, always facing player
- **Rarity color scheme:**
  - Common: white/gray glow, `emissiveIntensity: 1`
  - Uncommon: green *(not yet downloaded — need rarity-bg-uncommon.glb)*
  - Rare: blue, `emissiveIntensity: 3`
  - Epic: purple *(not yet downloaded — need rarity-bg-epic.glb)*
  - Legendary: orange, `emissiveIntensity: 4`
  - Mythic: red *(not yet downloaded — need rarity-bg-mythic.glb)*
  - Unique: pink *(not yet downloaded — need rarity-bg-unique.glb)*
- **Pointer event** on card — hover text shows item info, E to pick up (Step 3)

---

## Messages (Client ↔ Server)

```
Client → Server:
  DROP    { itemId, name, rarity, position: {x,y,z}, playerAddress }
  PICKUP  { droppedItemId, playerAddress, playerPosition: {x,y,z} }

Server → Client:
  ITEM_DROPPED  { droppedItemId, itemData, position }
  ITEM_PICKED   { droppedItemId, pickerAddress }
  SYNC_ALL      { items: [...] }
  ERROR         { message }
```

*Updated: PICKUP now includes playerPosition for server-side proximity validation.
Added ERROR message for failed actions.*

---

## Open Questions for Prototype

- [x] Can we read a player's wearables from within an SDK7 scene?
  → Yes, via fetch to Decentraland's Lambda API or The Graph (Polygon subgraph)
- [ ] What's the simplest escrow/transfer mechanism for L2 wearables?
  → Needs research. Simple ERC-721 escrow contract on Polygon is the path.
- [x] Should the prototype use real transfers or just simulate with server state?
  → Simulate first (Steps 2-4), real transfers later (Step 5)
- [x] How close does a player need to be to pick up? (2m? 3m?)
  → 3m feels right. Close enough to be intentional, far enough to not be fiddly.
- [x] Max items on the ground at once?
  → 30 items (each item = ~4 entities, leaves headroom in 2x2 parcel budget)
- [ ] How do we handle multiple players trying to pick up the same item simultaneously?
  → Server processes first valid request, rejects subsequent ones. FIFO.
- [ ] Should dropped items have a visual "owner tag" showing who dropped them?
  → Nice to have. Adds social element. Add in Step 6 polish.

---

## Definition of Done

The prototype is "done" when:
- [ ] A player can select a wearable and drop it at their feet
- [ ] The item appears as a glowing 3D object visible to all players
- [ ] The item persists after the dropper leaves
- [ ] Another player can walk up, see the item, and pick it up
- [ ] The item disappears from the world and is "claimed" by the picker
- [ ] A visitor walks in and immediately understands what's happening

*Note: Checkboxes reset to unchecked — these were prematurely marked done.
They represent the FULL prototype completion, not individual steps.*
