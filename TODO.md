# USDT Sender — TODO

## ✅ Completed

### Core Fixes (js/app.js)
- [x] Fix 1 — `updateNetworkBadge()`: TRON shows "TRC-20 · TRON Mainnet" instead of "Chain ID: null"
- [x] Fix 2 — `refreshBalances()`: Skip ethers.js for TRON (handled by `_setupTron`)
- [x] Fix 3 — `checkFaucetStatus()`: Skip ethers.js for TRON (no faucet on TRON)
- [x] Fix 4 — `showConfirmModal()`: TRON-specific gas display (~1-5 TRX + ETH equiv value)
- [x] Fix 5 — `bindEvents()` address indicator: Validates TRON addresses (T...) vs EVM (0x...)
- [x] Fix 6 — `loadTransactionHistory()`: gasStr handles non-numeric values (TRON '~30 TRX' → no NaN)
- [x] Fix 7 — `_executeSendTron()`: Progress bar updates, local balance update, `type:'send'` field, ETH equiv stored
- [x] Fix 8 — `_showSuccessStep()`: Accepts both object (TRON) and individual params (EVM), shows ETH equiv in purple

### Etherscan-style Transaction Cards
- [x] `.etx-card` cards with type badge, network badge, status badge
- [x] ETH equivalent shown in purple (`#a78bfa`) on every send card
- [x] Gas display handles TRON '~30 TRX' string (no NaN)
- [x] Explorer links: TronScan / Polygonscan / Etherscan / Tenderly per network
- [x] Success modal shows: block, gas, ETH equiv (purple), amount, recipient, network

### Transfer Delivery (all wallets)
- [x] Tenderly: `eth_sendTransaction` → real ERC-20 transfer() → ANY address receives
- [x] Tenderly fallback: `tenderly_setErc20Balance` → sets balance directly → ANY address
- [x] Polygon/Sepolia: real ERC-20 `transfer()` → ANY address receives
- [x] TRON: real TRC-20 `contract.transfer().send()` → ANY TRON address receives
- [x] ERC-20/TRC-20 tokens stored in contract mapping → recipient receives regardless of swap capability

### Dependencies
- [x] `tronweb@5.3.2` added to package.json
- [x] `deploy-tron` script added to package.json scripts

## ✅ TRON Contract Deployed

- [x] `npm run deploy-tron` — deployed successfully
- [x] Contract address: `TL62k7qgLbstQ9r4cMWi7iK5jcvXsP63RZ`
- [x] Tx ID: `0f5fef366f261cc764f528e0dddb1efa5e600c84b3c90c1f52e897e68607b055`
- [x] TronScan: https://tronscan.org/#/contract/TL62k7qgLbstQ9r4cMWi7iK5jcvXsP63RZ
- [x] Address saved to `js/config.js` → `tron.usdtAddress`
- [x] Script version bumped to `?v=16` in `index.html`

## 📱 Add Token to Wallets (Manual Step)
To receive USDT in Exodus / Trust Wallet / TronLink:
- Network: **TRON (TRC-20)**
- Contract: `TL62k7qgLbstQ9r4cMWi7iK5jcvXsP63RZ`
- Symbol: `USDT`
- Decimals: `6`
