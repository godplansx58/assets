# 🚀 USDT Sender — Deployment Guide

This guide explains how to deploy the custom USDT token contract on **Sepolia Testnet** (free, no real money needed).

---

## 📋 Prerequisites

- [MetaMask](https://metamask.io/download/) installed in your browser
- A MetaMask wallet (any account)

---

## STEP 1 — Add Sepolia Testnet to MetaMask

1. Open MetaMask → click the network dropdown (top center)
2. Click **"Add network"** → **"Add a network manually"**
3. Fill in:
   - **Network name:** `Sepolia Testnet`
   - **RPC URL:** `https://rpc.sepolia.org`
   - **Chain ID:** `11155111`
   - **Currency symbol:** `ETH`
   - **Block explorer:** `https://sepolia.etherscan.io`
4. Click **Save** and switch to Sepolia

---

## STEP 2 — Get Free Sepolia ETH (for gas fees)

You need a tiny amount of Sepolia ETH to pay gas fees. It's completely free:

| Faucet | Link |
|--------|------|
| Alchemy Faucet | https://sepoliafaucet.com |
| Infura Faucet | https://www.infura.io/faucet/sepolia |
| Chainlink Faucet | https://faucets.chain.link/sepolia |
| QuickNode Faucet | https://faucet.quicknode.com/ethereum/sepolia |

> **Tip:** Most faucets give 0.1–0.5 Sepolia ETH — more than enough for hundreds of transactions.

---

## STEP 3 — Deploy the Contract via Remix IDE (Recommended)

**Remix IDE** is a free browser-based Solidity IDE — no installation needed.

### 3.1 Open Remix
Go to: **https://remix.ethereum.org**

### 3.2 Create the contract file
1. In the left panel, click the **📄 Files** icon
2. Click **"+"** to create a new file
3. Name it: `CustomUSDT.sol`
4. Copy and paste the entire content of `contracts/CustomUSDT.sol` from this project

### 3.3 Compile the contract
1. Click the **🔧 Solidity Compiler** icon (left panel)
2. Set compiler version to **`0.8.20`** (or any 0.8.x)
3. Click **"Compile CustomUSDT.sol"**
4. ✅ You should see a green checkmark

### 3.4 Deploy to Sepolia
1. Click the **🚀 Deploy & Run** icon (left panel)
2. Change **Environment** to: **"Injected Provider - MetaMask"**
3. MetaMask will pop up — connect your wallet and select **Sepolia Testnet**
4. Make sure the **Contract** dropdown shows `CustomUSDT`
5. Click the orange **"Deploy"** button
6. MetaMask will ask you to confirm — click **Confirm**
7. Wait ~15 seconds for the transaction to be mined

### 3.5 Copy the contract address
1. In Remix, expand the **"Deployed Contracts"** section (bottom left)
2. Copy the contract address (starts with `0x...`)
3. You can also verify it on: `https://sepolia.etherscan.io/address/YOUR_ADDRESS`

---

## STEP 4 — Update the App Configuration

Open `js/config.js` and replace `"DEPLOY_FIRST"` with your contract address:

```javascript
// BEFORE:
USDT_CONTRACT_ADDRESS: "DEPLOY_FIRST",

// AFTER (example):
USDT_CONTRACT_ADDRESS: "0xYourContractAddressHere",
```

Save the file.

---

## STEP 5 — Use the App

1. Open `index.html` in your browser
2. Click **"🦊 Connect MetaMask"**
3. Make sure MetaMask is on **Sepolia Testnet**
4. Click **"🚰 Claim 1,000,000 USDT"** to get free tokens
5. Enter a recipient address and amount
6. Click **"Send USDT"** and confirm in MetaMask
7. ✅ Transaction appears on **https://sepolia.etherscan.io**

---

## 🔄 How It Works

```
Wallet A  ──[transfer]──►  Smart Contract  ──►  Wallet B
                              (Sepolia)
                         ✓ Visible on Etherscan
                         ✓ Real balance update
                         ✗ Cannot swap
                         ✗ Cannot withdraw to fiat
```

- **Any wallet** can claim 1,000,000 USDT from the faucet (once per wallet)
- **Transfers** are real on-chain transactions — recipient balance increases immediately
- **No DEX liquidity** — the token cannot be swapped on Uniswap or any exchange
- **No fiat bridge** — there is no way to convert this token to real money

---

## 🛠️ Optional: Deploy via Node.js Script

If you prefer command line:

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env
# Edit .env and add your private key

# 3. Run deployment
npm run deploy
```

> ⚠️ **Security:** Never share your private key. Use a dedicated test wallet, not your main wallet.

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| MetaMask shows wrong network | Switch to Sepolia in MetaMask |
| "Insufficient funds" error | Get free Sepolia ETH from a faucet |
| Transaction pending forever | Increase gas price in MetaMask settings |
| Contract not found | Make sure you updated `js/config.js` with the correct address |
| Faucet already claimed | Each wallet can only claim once — use a different wallet |

---

## 📊 Contract Details

| Property | Value |
|----------|-------|
| Name | Tether USD |
| Symbol | USDT |
| Decimals | 6 |
| Initial Supply | 1,000,000,000,000 USDT (to deployer) |
| Faucet Amount | 1,000,000 USDT per wallet |
| Network | Sepolia Testnet (Chain ID: 11155111) |
| Block Explorer | https://sepolia.etherscan.io |
