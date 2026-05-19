# Deploying LootDropEscrow via Remix

## Prerequisites
- Your LootDrop wallet (0x427819D66a05075753234377978D5f94bAf7Be83) loaded in MetaMask
- MetaMask switched to **Polygon Mainnet**
- Small amount of MATIC/POL for gas (~$0.01)

## Steps

### 1. Open Remix
Go to https://remix.ethereum.org in the browser where your LootDrop MetaMask is installed.

### 2. Create the contract file
- In the left sidebar, click the **file explorer** (top icon)
- Click the **new file** icon, name it `LootDropEscrow.sol`
- Paste the entire contents of `contracts/LootDropEscrow.sol` from this project

### 3. Add OpenZeppelin imports
Remix auto-downloads OpenZeppelin imports. But if it doesn't:
- Click the **plug icon** (Plugin Manager) → search "OpenZeppelin" → activate it
- Or just paste — Remix usually resolves `@openzeppelin/...` imports automatically

### 4. Compile
- Click the **Solidity Compiler** tab (left sidebar, looks like an "S")
- Set compiler version to **0.8.20** (or auto-detect)
- Click **"Compile LootDropEscrow.sol"**
- Should show a green checkmark ✅

### 5. Deploy
- Click the **Deploy & Run** tab (left sidebar, looks like an arrow)
- **Environment**: select **"Injected Provider - MetaMask"**
- MetaMask popup → confirm it's your LootDrop wallet on Polygon
- **Contract**: select **"LootDropEscrow"** from the dropdown
- Click **"Deploy"**
- MetaMask popup → confirm the transaction (gas should be ~0.001 MATIC)

### 6. Save the contract address
- After deployment, the contract appears under **"Deployed Contracts"** in Remix
- Copy the contract address
- Give it to OpenDCL so we can wire it into the scene

## Verification (Optional)
You can verify the contract on PolygonScan so anyone can read the source:
1. Go to https://polygonscan.com/address/YOUR_CONTRACT_ADDRESS
2. Click "Contract" → "Verify and Publish"
3. Paste the source code, select Solidity 0.8.20, no optimization
