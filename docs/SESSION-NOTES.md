# Session Notes — May 26, 2026

## What We Accomplished

### Forum Post
- Wrote and refined a forum post: "What If Your NFTs Actually Existed in the World?"
- Structure: Hook → Edge → Diagnosis → Thesis → Unlocks → Bots/Griefing → How to Build → Conclusion
- Draft is in Google Docs, ready for final edit and posting

### Engineering Doc
- Rewrote PITCH-ENGINEERING.md as a technical reference (not a pitch)
- Reflects all current architecture, live URLs, contract addresses

### Demo Fixes
- **Fixed the blocking bug** — emptied main.crdt which had Creator Hub editor entities causing "Engine is already sealed" error
- **Added MOCK_MODE** flag to bypass relay for local testing
- **Fixed card visuals** — thumbnail/text overlap fixed (Z positioning), text moved lower on card
- **Unified card model** — all rarities use common.glb, white text shows rarity
- **Synced colors** — drop confirm button uses rarity color from colors.ts
- **UI cleanup** — inventory button moved to top-center, red styling, emoji removed
- **Full address** in pickup notifications instead of truncated

### Infrastructure Deployed
- **Escrow contract V3** deployed on Polygon: `0x8D570E3Af597aFd0cB82A6Ad2440bDA6EAA6338C`
  - Relay wallet: `0x427819D66a05075753234377978D5f94bAf7Be83` (~198 POL)
  - Owner: Luke's main wallet
  - Has setRelay() to swap relay address if needed
- **Relay server** on Railway: `https://lootdrop-production.up.railway.app`
  - Health endpoint works, wallet connected, contract verified
  - Approval page live at `/approve.html`
- **Scene deployed** to World: `lootdrop.dcl.eth`
  - `https://play.decentraland.org/?NETWORK=mainnet&position=0,0&realm=lootdrop.dcl.eth`

### MOCK_MODE
- Currently set to `false` in `src/shared/contracts.ts`
- Flip to `true` for local testing without blockchain
- When false, real drops go through relay → escrow contract

## Blocking Issue: signedFetch Auth Verification

**Problem:** The relay rejects all drop/claim requests with "invalid or missing DCL authentication". The signedFetch auth chain headers arrive correctly (x-identity-auth-chain-0/1/2, x-identity-metadata, x-identity-timestamp) but `Authenticator.validateSignature` fails for all payload formats we've tried.

**What we tried:**
- Raw body capture (express verify callback) to avoid JSON re-serialization mismatch
- Multiple payload format attempts:
  - `post:/drop:{body}`
  - `post:{fullUrl}:{body}`
  - `post:{originalUrl}:{body}`
  - just the raw body
- All fail validation

**What we logged (from Railway):**
- Auth chain has 3 links (link 0, 1, 2)
- Raw body arrives correctly
- Headers are present

**What to investigate next session:**
1. Check the Railway logs after the latest debug push — the new logging shows each auth chain link's type and payload, which will reveal what was actually signed
2. The signed payload format might be different from what we expect. The auth chain link 2's payload field likely contains the actual signed content — compare it to our attempted payloads
3. Look at how other DCL projects verify signedFetch (e.g., dcl-crypto examples, Decentraland's own servers)
4. Consider temporarily disabling auth for testing to confirm the rest of the flow works, then fix auth separately
5. Check if `@dcl/crypto` version matters — we're using `^3.4.5`, might need a different version

**Quick workaround to test the full flow:**
- Temporarily skip auth in the relay (return the address from the auth chain without validating the signature)
- This is insecure but would let us verify the escrow contract + relay + scene integration works end-to-end
- Then fix auth properly after

## File Locations
- Forum post draft: Google Docs (Luke's)
- Scene: `C:\Users\luke\appdata\roaming\creator-hub\scenes\lootdrop`
- Relay: `relay/` subdirectory (deployed on Railway)
- Contract source: `contracts/LootDropEscrowV2.sol` (deployed as V3 on Polygon)
- Approval page: `relay/public/approve.html`
- Relay .env: `relay/.env` (gitignored, contains private key)

## Important: main.crdt
The `main.crdt` file MUST stay empty. Creator Hub may regenerate it. If the scene stops loading with "Engine is already sealed", empty this file again: `printf '' > main.crdt`
