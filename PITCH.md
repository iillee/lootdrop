# LootDrop

## Items should exist in the world

Decentraland has on-chain land, on-chain wearables, and a persistent 3D world connecting them. But right now, those assets live in browser tabs and marketplace pages. The 3D world is a viewer — you can see things, but you can't really *do* things with what you own.

LootDrop bridges that gap with a simple mechanic: drop an NFT as a 3D object in the world. It stays there. Someone else walks up and picks it up. It's theirs.

That's the core. Everything else grows from it.

---

## What the prototype does today

The working prototype runs as an SDK7 authoritative server scene on a 2×2 parcel:

- **Drop** — Click "Drop," select a wearable from your actual wallet inventory (fetched from the catalyst API). It appears as a rarity-coded 3D card at your feet.
- **Pickup** — Walk within 3 meters, press E. The server validates proximity using `PlayerIdentityData` + `Transform` — no client-reported positions, so anti-cheat is built in. First-come-first-served.
- **Persistence** — Items survive scene restarts and player disconnections via the Storage API. New players get a full sync of everything on the ground.
- **Real data** — The drop UI shows your actual DCL wearables pulled from the catalyst lambdas. Names, rarities, URNs — all real.

What it doesn't do yet: actual on-chain transfers. Drops are recorded server-side, but no tokens move on Polygon. That's the next step.

---

## What this unlocks

### Land becomes economically active

LAND today is a canvas — you build something, people visit or don't, and the parcel itself is passive. LootDrop gives every parcel economic utility.

The concept: each parcel gets an associated wallet contract. Landowners set drop policies — open, invite-only, fee-required, closed. A high-traffic parcel isn't just valuable because people walk through it, but because *items accumulate there*. An intersection becomes a marketplace. A hidden corner becomes a dead drop. A nightclub charges a fee to drop items inside, turning their venue into a trading floor.

LAND rental becomes more meaningful because renters inherit the economic activity of the location. Parcels compete on policies — open bazaars, curated galleries, invite-only vaults.

No other platform has on-chain land ownership *and* on-chain item ownership *and* a persistent 3D world to bridge them. This is a utility only Decentraland can offer.

### Trading becomes social

Two players stand near each other. A spatial trade surface appears between them. Each places items on their side. Both confirm. An escrow contract executes an atomic swap. The items visually transfer.

No marketplace tab. No browser. Just two people making a deal in a 3D space — negotiating in voice chat, inspecting what's on the table, the way trading has worked for thousands of years. Every wearable becomes a potential gift, game prize, or conversation starter. Trading volume goes up because trading becomes *fun*.

### The world generates its own reasons to visit

Decentraland's engagement model is event-driven today. No event scheduled, no reason to log in. LootDrop creates passive engagement loops that don't require anyone to organize anything:

- Someone leaves a rare wearable near the plaza. Word spreads.
- Brands hide real NFTs across the map for scavenger hunts.
- Street markets form organically where players stand with items visible.
- Dead drops let you leave something at a hidden location for a specific person.
- Delivery quests emerge — carry this item from parcel A to parcel B.

These experiences aren't programmed. They emerge from one rule: items can exist in space.

### Players control their experience

Not everyone wants a world littered with items. A visual filter layer lets players show everything, show only verified items, show only their watchlist, or hide items entirely. Landowners curate what's visible on their parcel. The system adds richness without adding noise.

---

## How it gets built

Each phase delivers standalone value. Nothing depends on everything being finished.

### Phase 1: On-chain escrow *(scene-level, no platform changes needed)*

A straightforward ERC-721 escrow contract on Polygon:

1. Player approves the escrow contract for their token
2. Calls `deposit(tokenId, parcelId)` — token transfers to escrow
3. Server records the drop with the on-chain tx hash
4. On pickup: escrow calls `safeTransferFrom` to the picker's address

This is buildable today with `eth-connect` and `createEthereumProvider` in SDK7. The signing UX is clunky (MetaMask popups), but it works. The magic moment — *"I dropped a real NFT and someone else actually received it"* — is achievable without any platform support.

### Phase 2: Face-to-face trading *(scene-level)*

The escrow contract extends to a 2-of-2 pattern — both parties deposit, both confirm, swap executes. The engineering is standard; the challenge is making the UX feel natural inside a 3D environment rather than a series of wallet popups.

### Phase 3: Parcel wallets *(needs platform awareness)*

Every parcel or estate gets an associated smart contract that can custody items:

- `setPolicy(parcelId, policy)` — landowner configures access rules
- `drop(parcelId, tokenId)` / `pickup(parcelId, tokenId)` — deposit and claim
- `recall(parcelId, tokenId)` — dropper reclaims their item
- `decay(parcelId)` — time-based auto-return of unclaimed items

**What this needs from the platform:** A registry contract mapping parcel coordinates to wallet addresses — either a new contract or an extension to existing LAND/Estate contracts. The explorer would also need to query parcel wallets and render dropped items natively, so items exist across the entire world rather than only inside scenes that implement custom rendering.

### Phase 4: Reputation system *(hybrid on-chain/off-chain)*

Open-world item interaction without trust gates would be instantly exploited. Bots snipe every drop, griefers flood parcels with junk. The answer is a soulbound trust score built from participation signals:

- **On-chain:** Account age, LAND/NAME ownership, DAO votes, trade history, badges
- **Off-chain:** Time in-world, social connections, scene visit diversity

Tiered access, enforced by the escrow and parcel-wallet contracts:

| Tier | Who | Can do |
|------|-----|--------|
| 0 | New accounts | See items |
| 1 | Established players | Receive gifts, join trades |
| 2 | Trusted players | Pick up public drops |
| 3 | Veterans | Drop items on public parcels |

This fights bot sniping and griefing without KYC, without permanently excluding newcomers, and without centralizing control. You earn trust by being part of Decentraland.

### Phase 5: Spatial rendering standard *(platform-level)*

For items to exist across the entire world, the explorer needs a rendering standard:

- Wearables with 3D models → render the model directly (most already have GLBs)
- 2D NFTs → render in a frame (NftShape already does this)
- Fungible tokens → render as a pouch/stack with quantity
- Unknown NFTs → generic glowing orb with metadata tooltip

The explorer already renders wearables on avatars. Extending this to ground objects is a natural evolution.

### Phase 6: Platform integration

DAO proposal to formalize this as a core feature. Open protocol specification. Multi-chain support.

---

## Who builds what

**Scene developers (today, no permission needed):**
- Escrow contract
- Single-scene prototypes (what's running now)
- Trade UI
- Community testing

**Foundation (infrastructure):**
- Parcel wallet registry contract
- Explorer-level item rendering
- Session key or embedded wallet support (the single most impactful change — if every interaction requires MetaMask popups, the experience dies)
- Reputation data pipeline

**DAO (governance and ecosystem):**
- Smart contract audits
- Reputation system parameters — what signals matter, what thresholds set the tiers (these are political decisions, not engineering ones)
- Grants for scene developers to integrate drop/pickup/trade
- Formal protocol specification

The ideal split: Foundation builds the pipes, DAO governs the policies, scene developers build the experiences.

---

## Why this matters now

The infrastructure is ready. SDK7 authoritative servers handle game logic. CRDT sync handles multiplayer state. The catalyst API provides wallet data. Polygon provides near-zero gas. The LAND contracts provide ownership. The marketplace contracts provide trade history.

No new token. No new chain. No new protocol. Just connecting what already exists in a way that makes the world feel like a world.

Every other metaverse platform treats items as inventory lines in a menu. Decentraland can be the first where they exist in space — where ownership is visible, where trading is social, and where land isn't just a canvas but an active participant in the economy.

The prototype is live. The code is open source. Come drop something on the ground and see how it feels.
