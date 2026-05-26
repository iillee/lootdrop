# LootDrop — Engineering Document

This is the technical companion to the [forum post](LINK). It covers what's been built, how it works, and what platform-level changes would be needed to scale this beyond a single scene.


## Architecture Overview

The scene runs an SDK7 authoritative server that manages all game state. The client fetches real wearables from the Catalyst API, resolves tokenIds from the Polygon subgraph, and sends drop/claim requests to an external relay server via signedFetch. The relay verifies the player's identity using DCL's auth chain, then submits gasless transactions to the escrow contract on Polygon using a hot wallet.

Stack: SDK7 authoritative server scene on a 2×2 parcel. Solidity escrow contract on Polygon. Node.js relay server on Railway. No new tokens, no new chains.


## What's Built

### Authoritative Server (src/server/server.ts)

The server is the source of truth. It handles:

- Drops — Reads the player's real position via PlayerIdentityData + Transform. Places the item at their feet. For real items, requires a valid on-chain dropId from the escrow contract. Broadcasts to all clients.
- Pickups — Server-side proximity check (3m horizontal distance). No client-reported positions, so anti-cheat is built in. For real items, a reservation system holds the item for 90 seconds while the player completes the on-chain claim via the relay. First-come-first-served for simultaneous requests.
- Persistence — All items written to the Storage API as a JSON blob. Survives scene restarts and player disconnections. Includes v1→v2 migration logic.
- Player sync — New players get a full sync of all items on connect, plus a list of URNs they've already dropped (filtered from their inventory UI).
- 30 item cap enforced server-side.

### Escrow Contract (LootDropEscrowV3)

Deployed on Polygon at 0x8D570E3Af597aFd0cB82A6Ad2440bDA6EAA6338C. Inherits ERC721Holder and Ownable from OpenZeppelin.

Interface:
- depositFor(owner, collection, tokenId) → dropId [relay only]
- claimFor(picker, dropId) [relay only]
- deposit(collection, tokenId) → dropId [direct]
- claim(dropId) [direct]
- withdraw(dropId) [dropper only]
- getDrop(dropId) → (collection, tokenId, dropper, active)
- setRelay(newRelay) [owner only]
- nextDropId() → uint256

The relay pattern: a trusted hot wallet (0x427819D66a05075753234377978D5f94bAf7Be83) submits transactions on behalf of players so they never pay gas or see MetaMask popups inside the scene. The contract enforces that only the relay address can call depositFor/claimFor. All transfers are verified post-execution (ownerOf check).

Prerequisite: Players must approve the escrow contract to transfer their NFTs. This is done via the approval page (setApprovalForAll per collection, or approve per token).

### Relay Server (relay/server.js)

Node.js + Express, deployed on Railway at https://lootdrop-production.up.railway.app. Three endpoints:

- POST /drop — Verifies DCL auth headers via @dcl/crypto Authenticator.validateSignature, calls escrow.depositFor(), returns { dropId, txHash }.
- POST /claim — Verifies auth, checks drop is still active, calls escrow.claimFor(), returns { txHash }.
- GET /health — Relay wallet balance, escrow address, and status.

Rate limited (1 action per player per 10 seconds). Polygon RPC via https://polygon-bor-rpc.publicnode.com.

Also serves a static approval page at /approve.html for players to authorize their NFTs.

### Client

- Inventory (src/client/inventory.ts) — Fetches the player's real DCL wearables from the Catalyst API (/lambdas/collections/wearables-by-owner/), batch-fetches metadata (names, rarities, thumbnails) from the content API, and resolves tokenId + contractAddress from the Polygon collections subgraph. Falls back to mock items for guests or fetch failures.
- UI (src/client/ui/) — Hotbar (10 slots) + scrollable inventory grid. Two-click swap system. Drop confirmation modal with blockchain status. Pickup notifications. Transaction status overlay.
- Item Renderer (src/client/itemRenderer.ts) — Dropped items appear as 3D cards with thumbnail textures, white text labels showing name and rarity, bob+spin animation, and pointer events for pickup.
- Blockchain (src/client/blockchain.ts) — signedFetch calls to the relay for both drops and claims. Safe JSON parsing for error handling. Status tracking for UI feedback.
- MOCK_MODE flag (src/shared/contracts.ts) — When true, bypasses all blockchain calls for local testing. Currently set to false for production.

### Message Protocol (src/shared/messages.ts)

Client → Server:
- requestDrop { name, rarity, urn, thumbnail, dropId, collection, tokenId }
- requestPickup { itemId }
- confirmPickup { itemId, txHash }

Server → Client:
- itemDropped { id, name, rarity, thumbnail, x, y, z, dropperId, dropId }
- itemPickedUp { id, pickerId, pickerName, itemName, rarity, urn, thumbnail, dropId, collection, tokenId }
- approvePickup { itemId, dropId, itemName, rarity }
- syncAll { itemsJson }
- droppedUrns { urnsJson }
- error { message }


## Live Deployment

- Scene: https://play.decentraland.org/?NETWORK=mainnet&position=0,0&realm=lootdrop.dcl.eth
- Relay: https://lootdrop-production.up.railway.app
- Approval page: https://lootdrop-production.up.railway.app/approve.html
- Escrow contract: https://polygonscan.com/address/0x8D570E3Af597aFd0cB82A6Ad2440bDA6EAA6338C
- Source code: https://github.com/iillee/lootdrop


## Current Status

### Working
- Full authoritative server drop/pickup/sync lifecycle
- Escrow contract V3 deployed on Polygon with relay pattern
- Relay server live on Railway with DCL auth verification
- Client inventory fetching real wallet data + subgraph tokenId resolution
- Hotbar/inventory UI with drag-swap and drop confirmation
- 3D item rendering with cards, thumbnails, animations
- Server-side persistence across restarts
- Reservation system for async on-chain claims
- Approval page with setApprovalForAll and single-token approval
- Deployed to World (lootdrop.dcl.eth)

### In Progress
- End-to-end real NFT drop/pickup test (all infrastructure is in place)
- Scene environment (ground plane, welcome sign, instructions for visitors)

### Known Limitations
- signedFetch does not work in local Creator Hub preview — must deploy to test blockchain flow
- No scene dressing — empty world, new visitors won't understand what they're looking at
- Player names show as full wallet addresses in pickup notifications
- Only 3 card model variants (common/rare/legendary) — all rarities currently use the common card


## What a Single Scene Can't Do

The prototype proves the mechanic works. But items only exist inside this one scene. For this to become a platform feature, several things need to happen at the explorer/protocol level:

### 1. Parcel Wallet Registry
A contract mapping parcel coordinates to wallet addresses. Each parcel gets an associated wallet that can custody items. Landowners configure drop policies but don't control the wallet itself. Could be a new contract or an extension to existing LAND/Estate contracts.

### 2. Explorer-Level Item Rendering
The explorer client should natively render dropped items without requiring a custom scene. Wearables with 3D models render directly (most already have GLBs). 2D NFTs get framed displays. Fungible tokens render as pouches with quantity. Unknown NFTs get a generic glowing orb.

### 3. Session Keys / Embedded Wallets
The relay pattern solves gas UX for this prototype, but at platform scale, native session key support would eliminate signing friction for all scene developers. This is the single most impactful platform improvement for enabling in-world economies.

### 4. Reputation Data Pipeline
Open-world item interaction without trust gates gets exploited immediately. The data already exists (account age, LAND ownership, DAO votes, badges, time in-world). What's missing is an aggregation layer that scenes and contracts can query.


## Roadmap

1. End-to-end real NFT drop and pickup test — IN PROGRESS
2. Scene environment and onboarding UX — next
3. Polish: sound effects, rarity glow, activity feed
4. P2P trading (spatial trade surface, 2-of-2 escrow) — design phase
5. Parcel wallet contracts — needs Foundation
6. Reputation system — needs DAO governance

Phases 1–4 are scene-level work. Phases 5–6 require platform support.


Last updated: May 2026
