# LootDrop — Long-Term Vision

## What Is LootDrop?

LootDrop is a platform-level feature for Decentraland that makes digital assets **physical, persistent, and interactive** inside the 3D world. Any NFT or token can be dropped as a visible object, carried by avatars, picked up by other players, and traded peer-to-peer — all in-world, no browser required.

LootDrop transforms Decentraland from a place you visit into a place where **things exist**.

---

## Core Ideas

### 1. Your Avatar IS Your Wallet
Your avatar is a spatial representation of your on-chain identity. You can:
- **Hold** items visibly (in-hand, on-back) as you walk the world
- **Store** items invisibly in your inventory (wallet)
- **Drop** items onto any parcel that allows it
- **Pick up** items from the ground (claiming from the parcel)
- **Trade** items face-to-face with other players

### 2. Parcel Wallets
Every parcel (or estate) has an associated wallet/contract that can custody items:
- Landowners control drop policies: open, whitelist, closed, fee-required
- Parcel wallet is a **host**, not an owner — droppers retain a claim
- Capacity limits per parcel prevent overflow
- Time decay returns unclaimed items to the dropper after X days
- If a landowner disables hosting, items return to dropper or spill to adjacent land

### 3. Reputation Protocol
A soulbound, non-transferable trust score earned through participation:
- **Signals**: Account age, time in-world, active friends, badges, trade history, DAO participation
- **Tiered access**:
  - Tier 0 (new): Can view items, can't interact
  - Tier 1 (established): Can receive gifts, basic interaction
  - Tier 2 (trusted): Can pick up public drops, initiate trades
  - Tier 3 (veteran): Can drop items on public parcels
- Fights both griefing and bot sniping simultaneously

### 4. Visual Filter Layer
Users control what they see:
- Show all items
- Show verified/curated items only
- Show items on a personal watchlist
- Hide all items
- Landowners can also curate visible item types on their parcel

### 5. P2P Trading
Spatial, face-to-face trading:
- Walk up to another player, initiate trade
- Both sides place items visually on a trade surface
- Negotiate, adjust, confirm
- Atomic on-chain swap via escrow contract
- No browser, no marketplace — just two people making a deal

### 6. Gas as Gameplay
- Picker-upper pays gas — creates a risk/reward gamble on every pickup
- Starting on L2 (Polygon) where gas is near-zero, so barrier is low
- Expandable to L1/other chains as the system matures

---

## Emergent Experiences

Once the core systems exist, these become possible naturally:
- **Scavenger hunts** — hide real NFTs across the world
- **Street markets** — players standing with items, haggling in chat
- **Delivery quests** — carry an item from parcel A to parcel B for payment
- **Dead drops** — leave items at hidden locations for specific people
- **Auctions** — hold up an item, people bid in real-time
- **Capture the flag** — with real NFTs as the flag
- **Flex culture** — walking through Genesis City visibly holding rare items
- **Gift giving** — walk up and hand someone something, physical and personal

---

## Build Priority & Order

### Phase 1 — Proof of Concept (Current)
**Goal**: Prove the core magic — drop a wearable, it persists, someone else picks it up.
- Single scene prototype
- Server-side persistence (authoritative server or external API)
- DCL wearables only (L2 Polygon)
- Basic 3D representation of dropped items
- Simple claim mechanic
- See: `PROTOTYPE.md` for detailed plan

### Phase 2 — P2P Trading
**Goal**: Two players can trade items face-to-face in-world.
- Spatial trade UI (React-ECS)
- Escrow smart contract (both deposit → both confirm → atomic swap)
- Trade history logging
- Basic reputation check (account age gate)

### Phase 3 — Parcel Wallet Contract
**Goal**: Formalize the drop/pickup mechanic on-chain.
- Smart contract: parcel-linked custody with landowner policies
- Drop policies configurable by landowner
- Time decay / auto-return
- Capacity limits

### Phase 4 — Reputation System
**Goal**: Trust layer that gates interactions.
- On-chain or hybrid reputation scoring
- Integration with existing DCL identity (badges, DAO participation)
- Tiered access enforcement
- Sybil resistance

### Phase 5 — Visual Layer & UX Polish
**Goal**: Make the world feel alive without overwhelming users.
- Client-side visual filters
- Item rendering standards (3D for models, framed cards for 2D NFTs, pouches for tokens)
- Landowner curation tools
- Notification system ("a rare item was just dropped near you!")

### Phase 6 — Multi-Chain & Platform Proposal
**Goal**: Expand beyond L2 wearables and propose as a DCL platform feature.
- Cross-chain item support
- DAO proposal for platform-level integration
- Universal NFT → 3D rendering standard
- Open protocol specification for other worlds to adopt

---

## Success Metrics
- Does it feel magical when you drop an item and a friend picks it up?
- Do people come back to explore / scavenge?
- Do organic social behaviors emerge (markets, gifting, games)?
- Does the DAO see this as worth integrating at the platform level?
