# LootDrop — Engineering Document

This is the technical companion to the [forum post](LINK). It covers what's been built, how it works, and what platform-level changes would be needed to scale this beyond a single scene.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   DECENTRALAND CLIENT                   │
│                                                         │
│  Inventory UI ─── fetches wearables from Catalyst API   │
│       │           + resolves tokenIds via Polygon        │
│       │             subgraph                             │
│       ▼                                                  │
│  Hotbar / Grid ── select item ── confirm drop            │
│       │                              │                   │
│       │                    signedFetch to Relay           │
│       │                              │                   │
│       ▼                              ▼                   │
│  Item Renderer              Relay Server (Node.js)       │
│  (3D cards, bob+spin,       │  verifies DCL auth chain   │
│   rarity glow, thumbnails)  │  submits Polygon tx        │
│       ▲                     │  via hot wallet             │
│       │                              │                   │
│       │                              ▼                   │
│  Auth Server ◄──────── Escrow Contract (Polygon)         │
│  (SDK7 server runtime)     depositFor / claimFor         │
│  • validates proximity                                   │
│  • manages reservations                                  │
│  • persists items (Storage API)                          │
│  • syncs state to all clients                            │
└─────────────────────────────────────────────────────────┘
```

**Stack:** SDK7 authoritative server scene on a 2×2 parcel. Solidity escrow contract on Polygon. Node.js relay server for gasless transactions. No new tokens, no new chains.

---

## What's Built

### Authoritative Server (`src/server/server.ts`)

The server is the source of truth. It handles:

- **Drops** — Reads the player's real position via `PlayerIdentityData` + `Transform`. Places the item at their feet. Validates name, rarity, and for real items, requires a valid on-chain `dropId` from the escrow contract. Broadcasts to all clients.
- **Pickups** — Server-side proximity check (3m horizontal distance). No client-reported positions, so anti-cheat is built in. For mock items, instant pickup. For real items, a reservation system: the item is held for 90 seconds while the player completes the on-chain claim via the relay.
- **Persistence** — All items written to the Storage API as a JSON blob. Survives scene restarts and player disconnections. Includes v1→v2 migration logic.
- **Player sync** — New players get a full sync of all items on connect, plus a list of URNs they've already dropped (filtered from their inventory UI).
- **30 item cap** enforced server-side.

### Escrow Contract (`contracts/LootDropEscrowV2.sol`)

Deployed on Polygon at `0xa90e7d45c7e8e0c82b4c480ad017cad35be0051e`.

```
depositFor(owner, collection, tokenId) → dropId    [relay only]
claimFor(picker, dropId)                            [relay only]
deposit(collection, tokenId) → dropId               [direct]
claim(dropId)                                        [direct]
withdraw(dropId)                                     [dropper only]
getDrop(dropId) → (collection, tokenId, dropper, active)
```

The relay pattern: a trusted hot wallet submits transactions on behalf of players so they never pay gas or see MetaMask popups inside the scene. The contract enforces that only the relay address can call `depositFor`/`claimFor`. Security relies on the relay verifying DCL `signedFetch` auth chains before submitting anything.

**Prerequisite:** Players must approve the escrow contract (not the relay) to transfer their NFTs. This is a one-time `approve()` or `setApprovalForAll()` call per collection, done on an external approval page.

### Relay Server (`relay/server.js`)

Node.js + Express. Three endpoints:

- `POST /drop` — Verifies DCL auth headers via `@dcl/crypto`, calls `escrow.depositFor()`, returns `{ dropId, txHash }`.
- `POST /claim` — Verifies auth, checks drop is still active, calls `escrow.claimFor()`, returns `{ txHash }`.
- `GET /health` — Relay wallet balance and status.

Rate limited (1 action per player per 10 seconds). Auth verification uses the same `Authenticator.validateSignature` pattern from the DCL crypto library — every request is cryptographically signed by the player's in-world session.

### Client

- **Inventory** (`src/client/inventory.ts`) — Fetches the player's real DCL wearables from the Catalyst API (`/lambdas/collections/wearables-by-owner/`), batch-fetches metadata (names, rarities, thumbnails) from the content API, and resolves `tokenId` + `contractAddress` from the Polygon collections subgraph. Falls back to mock items for guests or fetch failures.
- **UI** (`src/client/ui/`) — Hotbar (10 slots) + scrollable inventory grid. Two-click swap system. Drop confirmation modal with blockchain status. Pickup notifications. Transaction status overlay.
- **Item Renderer** (`src/client/itemRenderer.ts`) — Dropped items appear as rarity-coded 3D cards (GLB models) with thumbnail textures, text labels, bob+spin animation, and pointer events for pickup.
- **Blockchain** (`src/client/blockchain.ts`) — `signedFetch` calls to the relay for both drops and claims. Status tracking for UI feedback.

### Message Protocol (`src/shared/messages.ts`)

```
Client → Server:
  requestDrop     { name, rarity, urn, thumbnail, dropId, collection, tokenId }
  requestPickup   { itemId }
  confirmPickup   { itemId, txHash }

Server → Client:
  itemDropped     { id, name, rarity, thumbnail, x, y, z, dropperId, dropId }
  itemPickedUp    { id, pickerId, pickerName, itemName, rarity, urn, thumbnail, dropId, collection, tokenId }
  approvePickup   { itemId, dropId, itemName, rarity }
  syncAll         { itemsJson }
  droppedUrns     { urnsJson }
  error           { message }
```

---

## Current Status

### Working
- Full authoritative server drop/pickup/sync lifecycle
- Escrow contract deployed on Polygon
- Relay server code complete with auth verification
- Client inventory fetching real wallet data + subgraph tokenId resolution
- Hotbar/inventory UI with drag-swap and drop confirmation
- 3D item rendering with rarity cards, thumbnails, animations
- Server-side persistence across restarts
- Reservation system for async on-chain claims

### Not Working
- **Scene won't load** — "Engine is already sealed" error at runtime. Compiles clean. Likely a component registration ordering issue with the auth server bundle. This is the blocking bug.
- **Relay not deployed** — `RELAY_URL` is still a placeholder. Relay code is written but needs hosting (Railway/Render) and a funded hot wallet.
- **Approval page not built** — Players need a way to approve the escrow contract for their NFTs before dropping. Planned as a simple HTML page served from the relay.
- **No environment/scene dressing** — Empty world. New visitors won't understand what they're looking at.

---

## What a Single Scene Can't Do

The prototype proves the mechanic works. But items only exist inside this one scene. For this to become a platform feature, several things need to happen at the explorer/protocol level:

### 1. Parcel Wallet Registry

A contract mapping parcel coordinates to wallet addresses. Each parcel (or estate) gets an associated wallet that can custody items. Landowners configure drop policies (open, invite-only, fee-required, closed) but don't control the wallet itself — droppers retain a claim on their items.

This could be a new contract deployed by the Foundation, or an extension to the existing LAND/Estate contracts. Without it, every scene developer has to build their own custody system.

### 2. Explorer-Level Item Rendering

Right now, each scene handles its own rendering. At platform scale, the explorer client should natively understand "this parcel has items on the ground" and render them without requiring a custom scene. The explorer already renders wearables on avatars — extending this to ground objects is a natural evolution.

Rendering standard:
- Wearables with 3D models → render the model directly (most already have GLBs)
- 2D NFTs → framed display (NftShape already does this)
- Fungible tokens → pouch/stack with quantity
- Unknown NFTs → generic glowing orb with metadata tooltip

### 3. Session Keys / Embedded Wallets

If every drop and pickup requires a MetaMask popup, the experience dies. The relay pattern solves this for the prototype (players approve once, relay submits all subsequent transactions), but at platform scale, native session key support or embedded wallets would eliminate this friction for all scene developers, not just LootDrop.

This is arguably the single most impactful platform improvement for enabling in-world economies.

### 4. Reputation Data Pipeline

Open-world item interaction without trust gates gets exploited immediately. The data for a reputation score already exists — account age, LAND/NAME ownership, DAO votes, marketplace history, badges, time in-world. What's missing is an aggregation layer that scenes and contracts can query.

Implementation options: attestation-based (EAS), soulbound token with mutable metadata, or hybrid off-chain computation with on-chain checkpoints. The DAO should own the parameters (what signals matter, what thresholds set the tiers) since those are governance decisions.

---

## Roadmap

| Phase | What | Status | Depends On |
|-------|------|--------|------------|
| **1** | Fix engine-sealed bug, get prototype loading | **Next** | Nothing |
| **2** | Deploy relay, fund hot wallet, end-to-end on-chain drops | Blocked on Phase 1 | Relay hosting |
| **3** | Build approval page, polish UI, add environment | Blocked on Phase 2 | Nothing |
| **4** | P2P trading (spatial trade surface, 2-of-2 escrow) | Design phase | Phase 3 |
| **5** | Parcel wallet contracts | Not started | Foundation |
| **6** | Reputation system | Not started | DAO governance |

Phases 1–4 are scene-level work that can be built without any platform changes. Phases 5–6 require Foundation infrastructure and DAO governance respectively.

---

## Links

- **Escrow contract:** [0xa90e...051e on Polygonscan](https://polygonscan.com/address/0xa90e7d45c7e8e0c82b4c480ad017cad35be0051e)
- **Source code:** [GitHub](LINK)
- **Forum post:** [LINK]
- **Vision document:** See `VISION.md` in the repo

---

*Last updated: May 2026*
