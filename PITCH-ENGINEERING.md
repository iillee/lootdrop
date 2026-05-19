# LootDrop: The Engineering Case

## What I'm Building and Why It Matters

I'm an engineer building a system that lets players drop NFTs as physical objects in Decentraland's 3D world. Pick them up. Trade them face-to-face. Leave them for strangers. The prototype already works — authoritative server, persistent storage, real wearable data from the player's wallet, spatial pickup with server-side validation.

But here's the thing: I've hit the ceiling of what a single scene can do. And the features that would make this transformative — the ones that would fundamentally change how Decentraland's economy works — require platform-level changes that no scene developer can implement alone.

This document is about what those changes are, why they're worth doing, and who should build them.

---

## What Exists Today (Scene-Level)

The current prototype runs as an SDK7 authoritative server scene on a 2×2 parcel:

- **Drop mechanic** — Player clicks "Drop," selects a wearable from their actual wallet inventory (fetched from the catalyst API), and it appears as a 3D card at their feet. Rarity-coded visuals — common through legendary.
- **Pickup mechanic** — Walk within 3 meters, press E. Server validates proximity using `PlayerIdentityData` + `Transform` (no client-reported positions — anti-cheat by default). First-come-first-served for simultaneous requests.
- **Persistence** — Server writes item state to the Storage API. Items survive scene restarts and player disconnections. When you connect, you get a full sync of everything currently on the ground.
- **Real wallet data** — The drop UI shows your actual owned DCL wearables, pulled from `peer.decentraland.org/lambdas/collections/wearables-by-owner/`. Names, rarities, URNs — all real.

What it *doesn't* do yet: actual on-chain transfers. When you "drop" a wearable, it's recorded server-side, but no token moves on Polygon. That's the next step, and it's where things get interesting.

---

## The Broad Engineering Roadmap

### Step 1: On-Chain Item Escrow (Scene-Level, No Platform Changes)

A simple ERC-721 escrow contract on Polygon. When you drop a wearable:
1. Client prompts you to `approve` the escrow contract for that token
2. Client calls `deposit(tokenId, parcelId)` — token transfers to escrow
3. Server records the drop with the on-chain transaction hash
4. When someone picks up: escrow calls `safeTransferFrom` to the picker's address
5. Picker pays gas (near-zero on Polygon)

This is buildable today with `eth-connect` and `createEthereumProvider` in SDK7. The signer UX is clunky (MetaMask popups), but it works. The magic moment — "I dropped a real NFT and someone else actually received it" — is achievable without any platform support.

**Risk:** Gas UX. Even on Polygon, prompting a transaction signature for every drop/pickup adds friction. Ideally, the platform would support session-based signing or gasless meta-transactions. That's a platform ask.

### Step 2: Parcel Wallet Contracts (Needs Platform Awareness)

Every parcel (or estate) gets an associated smart contract that can custody items. This is where LAND transforms from a coordinate into an economic actor.

The contract logic:
- `setPolicy(parcelId, policy)` — landowner configures: open, whitelist, fee-required, closed
- `drop(parcelId, tokenId)` — deposit an item into the parcel's custody
- `pickup(parcelId, tokenId)` — claim an item (subject to policy + reputation tier)
- `recall(parcelId, tokenId)` — dropper reclaims their item
- `decay(parcelId)` — time-based auto-return of unclaimed items

**What this needs from the platform:**
- A registry contract mapping parcel coordinates → wallet addresses. This could be a new contract deployed by the Foundation, or an extension to the existing LAND/Estate contracts.
- The explorer client needs to query parcel wallets and render dropped items. Right now, each scene handles its own rendering. At platform scale, the client should natively understand "this parcel has 12 items on the ground" and render them without requiring a custom scene.

### Step 3: Spatial Item Rendering Standard (Platform-Level)

For items to exist across the entire world — not just inside one scene — the explorer needs a rendering standard:

- **Wearables with 3D models** → render the model directly (most wearables already have GLBs)
- **2D NFTs** → render in a frame (NftShape already does this, just needs to work spatially)
- **Fungible tokens** → render as a pouch/stack with quantity label
- **Unknown NFTs** → render as a generic glowing orb with metadata tooltip

This is a client-side feature. The explorer already renders wearables on avatars — extending this to render them as ground objects is a natural evolution, not a paradigm shift.

### Step 4: Reputation System (Hybrid On-Chain/Off-Chain)

Open-world item interaction without trust gates would be instantly exploited. Bots would snipe every drop. Griefers would flood parcels with junk.

The reputation system is a soulbound score built from:
- **On-chain signals:** Account age, LAND/NAME ownership, DAO voting history, marketplace trade history, badge holdings
- **Off-chain signals:** Time spent in-world (from catalyst/comms data), active social connections, scene visit diversity

Implementation options:
1. **Attestation-based** (EAS or similar) — off-chain computation, on-chain attestations. Cheapest. Most flexible.
2. **Soulbound token** — a non-transferable ERC-721 with mutable metadata. More visible on-chain but higher gas cost to update.
3. **Hybrid** — off-chain score computation with periodic on-chain checkpoints. The scene/client queries an API for the score but can verify against on-chain roots.

**Tiered access (enforced by the escrow/parcel-wallet contracts):**
- Tier 0 (new accounts): Can see items. Can't interact.
- Tier 1 (established): Can receive gifts and participate in trades.
- Tier 2 (trusted): Can pick up public drops.
- Tier 3 (veteran): Can drop items on public parcels.

This fights both bot sniping and griefing without KYC or centralized approval.

### Step 5: P2P Trading Protocol (Scene + Platform)

Face-to-face trading is the social endgame. Two players standing near each other:
1. Player A initiates trade (proximity-triggered, like the pickup mechanic)
2. Both players see a spatial trade surface between them
3. Each drags items onto their side
4. Both confirm → escrow contract executes atomic swap
5. Items visually transfer across the surface

The escrow contract for this is a standard 2-of-2 multi-sig pattern — both parties deposit, both confirm, swap executes. The hard part isn't the contract; it's the **UX of signing multiple transactions in a 3D environment** without breaking immersion.

**Platform ask:** Session keys or embedded wallet support. If every trade requires 2-3 MetaMask popups per player, the experience dies. This is arguably the single most impactful platform improvement for enabling in-world economies.

---

## What This Does to Decentraland's Economy

### LAND Becomes Productive

Right now, LAND value is speculative — based on location and adjacency, with no revenue-generating mechanism beyond hosting events. Parcel wallets make LAND economically active:

- High-traffic parcels earn fees from item drops (landowner-set)
- Strategic locations become natural marketplaces
- Parcels compete on policies — some are open bazaars, some are curated galleries, some are invite-only vaults
- LAND rental becomes more valuable because renters get the economic activity of the parcel

### Wearables Get a Second Life

The current wearable economy is mint → wear → maybe sell on marketplace. LootDrop adds: gift, hide, trade in-person, leave as loot, use as game prizes. Every wearable becomes a potential game piece, gift, or social signal. Trading volume increases because trading is *fun* — it happens in a 3D space with another person, not on a web page.

### Engagement Loops That Don't Require Events

Decentraland's current engagement model is event-driven. No event, no reason to log in. LootDrop creates passive engagement: "I wonder if anyone dropped something interesting near the plaza." Scavenger hunts, dead drops, street markets — these happen without anyone organizing them. They emerge from the system.

---

## Who Should Build This

### What Scene Developers Can Do (Today)
- The escrow contract (Phase 1)
- Single-scene prototypes (what we're building now)
- The trade UI
- Community testing and iteration

### What Requires the Foundation
- **Parcel wallet registry** — linking parcel coordinates to custody contracts
- **Explorer-level item rendering** — so items exist across the world, not per-scene
- **Session key / embedded wallet support** — so signing transactions doesn't break immersion
- **Reputation data pipeline** — aggregating on-chain and off-chain signals into a queryable score

### What the DAO Should Fund
- Smart contract audits for the escrow and parcel wallet systems
- The reputation system design and implementation
- A formal protocol specification so this becomes an open standard
- Grants for scene developers to integrate drop/pickup/trade into existing experiences

### Foundation vs. DAO: Who Leads?

The Foundation is better positioned to build the **infrastructure** — explorer changes, contract deployments, client rendering standards. These are core protocol decisions that affect every user and need to ship with the explorer.

The DAO is better positioned to fund the **ecosystem** — audits, grants, community testing, governance of the reputation system. The DAO should own the reputation parameters (what signals matter, what thresholds set the tiers) because those are political decisions, not engineering ones.

The ideal split: Foundation builds the pipes, DAO governs the policies, and scene developers build the experiences on top.

---

## What I'm Asking For

Not funding. Not permission. The prototype is being built regardless.

What I'm asking for is **awareness** — that this direction is possible, that the infrastructure needed is specific and achievable, and that if it works, it should become part of the platform rather than remaining a clever hack in a single scene.

The pieces are all there. SDK7's authoritative servers handle the game logic. CRDT sync handles multiplayer state. The catalyst API provides wallet data. Polygon provides near-zero gas for transfers. The LAND contracts provide ownership. The marketplace contracts provide trade history.

No new token. No new chain. No new protocol. Just connecting what already exists in a way that makes the world feel like a world.

The hardest part isn't the engineering. It's getting the right people to see what's possible before they make decisions that go in a different direction.

---

*The code is open source. The prototype is live. Come drop something on the ground and see how it feels.*
