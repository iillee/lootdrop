# LootDrop Relay Server — Implementation Plan

## Overview

The DCL scene sandbox can't send Polygon transactions directly. We need a **relay server** that listens for signed player intents and executes the on-chain escrow calls on their behalf.

```
Player in DCL  ──signedFetch──>  Relay Server  ──polygon tx──>  Escrow Contract
                                 (Node.js)                      (on Polygon)
                                 Has hot wallet
                                 with MATIC
```

---

## Architecture

### What exists today (working)
- **Escrow contract** on Polygon (`0xa90e7d45c7e8e0c82b4c480ad017cad35be0051e`)
- **Authoritative server** in DCL that manages game state, proximity, persistence
- **Scene UI** with inventory, hotbar, drop/pickup flow
- **Subgraph integration** that resolves wearable URNs → tokenIds

### What we're adding
- **Relay server** (Node.js + Express + ethers.js) — hosted externally
- **Hot wallet** — a new Polygon wallet that submits transactions and pays gas
- **Scene changes** — replace direct contract calls with `signedFetch` to the relay
- **Contract redeployment** — add a `depositFor()` function so the relay can deposit on behalf of players

---

## Pre-Work (before the coding session)

### 1. Create the Hot Wallet

**What:** A fresh Ethereum wallet that the relay server controls.
**Why:** This wallet pays gas fees and submits transactions on behalf of players.

- Open MetaMask → Create a new account (or use a fresh one)
- Switch to Polygon network
- Note down the **private key** (Account Details → Export Private Key)
- Fund it with **5-10 MATIC** from your main wallet (enough for hundreds of transactions)
- Store the private key securely — it goes in the relay server's `.env` file

### 2. Choose a Hosting Platform

The relay server is a simple Node.js app. Pick one:

| Platform | Free tier? | Setup |
|----------|-----------|-------|
| **Railway** | $5/mo trial credits | `railway up` |
| **Render** | Free for web services | Connect GitHub repo |
| **Vercel** | Free serverless | Good for simple endpoints |
| **Any VPS** | Varies | `node server.js` |

For a PoC, **Railway** or **Render** are easiest. You just need a public HTTPS URL.

---

## Step 1: Redeploy the Escrow Contract

**Why:** The current `deposit()` uses `transferFrom(msg.sender, ...)` so only the NFT owner can call it. We need the relay wallet to call it on the owner's behalf.

**What changes:**

Add one new function to `LootDropEscrow.sol`:

```solidity
/// @notice Deposit on behalf of a player. Only callable by the relay wallet.
/// @dev The player must have approved THIS CONTRACT (not the relay) to transfer their NFT.
function depositFor(address owner, address collection, uint256 tokenId) external returns (uint256 dropId) {
    require(msg.sender == relay, "Only relay");
    require(collection != address(0), "Invalid collection");

    dropId = nextDropId++;
    drops[dropId] = Drop({
        collection: collection,
        tokenId: tokenId,
        dropper: owner,
        active: true
    });

    // Transfer NFT from the OWNER to this contract
    // Requires the owner to have called collection.approve(escrowAddress, tokenId) beforehand
    IERC721(collection).transferFrom(owner, address(this), tokenId);

    emit ItemDeposited(dropId, collection, tokenId, owner);
}

/// @notice Claim on behalf of a player. Only callable by the relay wallet.
function claimFor(address picker, uint256 dropId) external {
    require(msg.sender == relay, "Only relay");
    Drop storage d = drops[dropId];
    require(d.active, "Drop not active");

    d.active = false;
    IERC721(d.collection).transferFrom(address(this), picker, d.tokenId);

    emit ItemClaimed(dropId, picker);
}
```

Also add to the constructor:
```solidity
address public relay;

constructor(address _relay) {
    relay = _relay;
}
```

**Steps:**
1. Open Remix: https://remix.ethereum.org
2. Update `LootDropEscrow.sol` with the changes above (full updated contract is in `contracts/LootDropEscrowV2.sol`)
3. Compile with Solidity 0.8.20, optimizer 200 runs
4. Switch MetaMask to Polygon
5. Deploy, passing your **hot wallet address** as the constructor argument
6. Note the new contract address
7. Update `src/shared/contracts.ts` with the new address

---

## Step 2: Build the Relay Server

**Why:** Receives signed requests from the DCL scene, verifies them, and submits Polygon transactions.

**What:** A Node.js server with 3 endpoints.

### Project setup
```bash
mkdir lootdrop-relay
cd lootdrop-relay
npm init -y
npm install express ethers cors dotenv
```

### File: `.env`
```
PRIVATE_KEY=0xYOUR_HOT_WALLET_PRIVATE_KEY
ESCROW_ADDRESS=0xNEW_CONTRACT_ADDRESS
POLYGON_RPC=https://polygon-rpc.com
PORT=3000
```

### File: `server.js`

Three endpoints:

#### `POST /drop`
- **Receives:** Player's wallet address, collection, tokenId (extracted from signed DCL request)
- **Verifies:** The request came from a valid DCL session (signedFetch headers)
- **Calls:** `escrow.depositFor(playerAddress, collection, tokenId)`
- **Returns:** `{ dropId, txHash }`

#### `POST /claim`
- **Receives:** Player's wallet address, dropId
- **Verifies:** The request came from a valid DCL session
- **Calls:** `escrow.claimFor(playerAddress, dropId)`
- **Returns:** `{ txHash }`

#### `GET /health`
- Returns relay wallet balance and status

### Verifying `signedFetch` requests

DCL's `signedFetch` adds authentication headers to every request. The relay server must verify these to prove the request came from a real player in Decentraland.

The signed headers include:
- `x-identity-auth-chain-0/1/2` — a chain of signatures proving wallet ownership
- `x-identity-timestamp` — when the request was signed

Use `@dcl/crypto` to validate:
```js
const { Authenticator } = require('@dcl/crypto')

async function verifyDCLAuth(req) {
    const authChain = []
    for (let i = 0; ; i++) {
        const header = req.headers[`x-identity-auth-chain-${i}`]
        if (!header) break
        authChain.push(JSON.parse(header))
    }
    const result = await Authenticator.validateSignature(
        `${req.method}:${req.originalUrl}:${JSON.stringify(req.body)}`,
        authChain,
        null
    )
    return result.ok ? authChain[0].payload.toLowerCase() : null
}
```

This guarantees the request came from the wallet that's logged into DCL. No one can forge it.

---

## Step 3: Update the Scene

**Why:** Replace direct contract calls with `signedFetch` to the relay.

### `src/shared/contracts.ts`
```typescript
export const ESCROW_ADDRESS = '0xNEW_CONTRACT_ADDRESS'
export const RELAY_URL = 'https://your-relay.railway.app'
```

### `src/client/blockchain.ts` — Rewrite

Strip out all `eth-connect` contract interaction. Replace with:

```typescript
import { signedFetch } from '~system/SignedFetch'
import { RELAY_URL } from '../shared/contracts'

export async function relayDrop(collection: string, tokenId: string): Promise<{ dropId: number, txHash: string }> {
    const res = await signedFetch({
        url: `${RELAY_URL}/drop`,
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection, tokenId })
        }
    })
    if (!res.ok) throw new Error('Drop failed: ' + res.body)
    return JSON.parse(res.body)
}

export async function relayClaim(dropId: number): Promise<{ txHash: string }> {
    const res = await signedFetch({
        url: `${RELAY_URL}/claim`,
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dropId })
        }
    })
    if (!res.ok) throw new Error('Claim failed: ' + res.body)
    return JSON.parse(res.body)
}
```

### `src/client/ui/state.ts` — Update drop flow

Replace `approveAndDeposit()` call with `relayDrop()`.

### `src/client/setup.ts` — Update pickup flow

Replace `claimDrop()` call with `relayClaim()`.

---

## Step 4: Player Approval (One-Time Setup)

**Why:** Before a player can drop an NFT, they must approve the escrow contract to transfer it. This is a standard ERC-721 `approve()` call that happens in MetaMask, outside the scene.

**Options for where this happens:**

### Option A: Simple approval page (recommended for PoC)
Build a minimal HTML page with ethers.js:
- Player connects MetaMask (on Polygon)
- Page shows their DCL wearables
- "Approve for LootDrop" button calls `collection.approve(escrowAddress, tokenId)`
- One-time per item, no gas from the relay

Host this at `https://your-relay.railway.app/approve` (serve it from the same server).

### Option B: setApprovalForAll
Player calls `collection.setApprovalForAll(escrowAddress, true)` once per collection. Approves ALL current and future tokens from that collection. More convenient but broader permission.

### How the scene handles unapproved items:
- When `relayDrop()` fails with "not approved", show a UI message:
  *"Visit lootdrop.example.com/approve to authorize this item first"*
- Or use `openExternalUrl` to send them to the approval page directly

---

## Step 5: Add Relay URL to Scene Permissions

In `scene.json`, whitelist your relay domain:

```json
{
    "requiredPermissions": ["ALLOW_MEDIA_HOSTNAMES"],
    "allowedMediaHostnames": ["your-relay.railway.app"]
}
```

This allows `signedFetch` to reach your relay from inside the scene.

---

## Summary of All Work

| Step | What | Where | Time est. |
|------|------|-------|-----------|
| **Pre-work** | Create hot wallet, fund with MATIC | MetaMask | 5 min |
| **Step 1** | Update + redeploy escrow contract | Remix | 15 min |
| **Step 2** | Build relay server (3 endpoints) | New Node.js project | 30 min |
| **Step 3** | Update scene to use signedFetch → relay | `blockchain.ts`, `state.ts`, `setup.ts` | 20 min |
| **Step 4** | Build simple approval page | HTML file on relay server | 15 min |
| **Step 5** | Deploy relay + redeploy scene | Railway/Render + DCL worlds | 10 min |

**Total: ~1.5 hours**

---

## File Checklist

### New files to create
- [ ] `contracts/LootDropEscrowV2.sol` — updated contract with `depositFor` / `claimFor`
- [ ] `relay/server.js` — relay server
- [ ] `relay/.env` — secrets (hot wallet key, contract address, RPC)
- [ ] `relay/package.json` — dependencies
- [ ] `relay/public/approve.html` — player approval page

### Existing files to modify
- [ ] `src/shared/contracts.ts` — new contract address + relay URL
- [ ] `src/shared/escrowAbi.ts` — add `depositFor` / `claimFor` to ABI
- [ ] `src/client/blockchain.ts` — replace eth-connect with signedFetch relay calls
- [ ] `src/client/ui/state.ts` — use `relayDrop()` instead of `approveAndDeposit()`
- [ ] `src/client/setup.ts` — use `relayClaim()` instead of `claimDrop()`
- [ ] `scene.json` — add `allowedMediaHostnames`

---

## Security Notes

- **Hot wallet exposure:** The relay's private key can only call `depositFor`/`claimFor` on the escrow. It can't steal NFTs because `depositFor` uses `transferFrom(owner, ...)` which requires the owner's approval of the escrow contract (not the relay).
- **signedFetch verification:** Every request is cryptographically signed by the player's DCL session. The relay verifies this before submitting any transaction.
- **No player gas fees:** The relay pays all Polygon gas. Budget ~0.01 MATIC per transaction.
- **Rate limiting:** Add basic rate limiting to the relay (1 drop per player per 10 seconds) to prevent hot wallet draining.
