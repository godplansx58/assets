/**
 * CustomUSDT TRC-20 Deployment Script — TRON Mainnet
 * Deploys the custom USDT token to TRON (cheap gas ~1-5 TRX per tx)
 *
 * Usage:
 *   1. npm install tronweb
 *   2. Create .env file:
 *        PRIVATE_KEY=your_tronlink_private_key_hex
 *   3. node deploy-tron.js
 *
 * Get TRX for gas (~10 TRX = ~$1, enough for deployment + many transfers):
 *   - Buy TRX on Binance, Coinbase, Kraken
 *   - Send to your TronLink address (starts with T)
 *
 * After deployment, update js/config.js:
 *   tron.usdtAddress: "T..."
 */

// tronweb v5+ exports a named export — use destructuring
const { TronWeb } = require('tronweb');
const fs      = require('fs');
require('dotenv').config();

const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').replace(/^0x/, '');
const TRON_API    = process.env.TRON_API || 'https://api.trongrid.io';
const ESTIMATED_DEPLOY_ENERGY = 520_000;
const NET_FEE_BUFFER_SUN = 6_000_000; // ~6 TRX

// ===== ABI =====
const CONTRACT_ABI = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  { "inputs": [{ "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "to", "type": "address" }, { "name": "value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "spender", "type": "address" }, { "name": "value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "from", "type": "address" }, { "name": "to", "type": "address" }, { "name": "value", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "claimFaucet", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "account", "type": "address" }], "name": "hasClaimed", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "from", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" }
];

// ===== BYTECODE — same compiled bytecode as CustomUSDT.sol (same Solidity) =====
function getBytecode() {
  try {
    const src = fs.readFileSync('./deploy.js', 'utf8');
    const match = src.match(/const CONTRACT_BYTECODE\s*=\s*"(0x[0-9a-fA-F]+)"/);
    if (match && match[1]) return match[1].replace(/^0x/, '');
  } catch (e) {}
  console.error('❌ Could not extract bytecode from deploy.js');
  process.exit(1);
}

// ===== MAIN =====
async function main() {
  if (!PRIVATE_KEY) {
    console.error('\n❌ ERROR: Set PRIVATE_KEY in .env file');
    console.log('PRIVATE_KEY=your_tronlink_private_key_hex\n');
    process.exit(1);
  }

  const bytecode = getBytecode();

  const tronWeb = new TronWeb({
    fullHost:   TRON_API,
    privateKey: PRIVATE_KEY
  });

  const address = tronWeb.defaultAddress.base58;
  console.log('🚀 Deploying CustomUSDT TRC-20 to TRON Mainnet...\n');
  console.log('📍 Deployer address:', address);

  // Check TRX balance
  const balanceSun = await tronWeb.trx.getBalance(address);
  const balanceTrx = balanceSun / 1_000_000;
  console.log('💰 TRX balance:', balanceTrx.toFixed(2), 'TRX');

  const chainParams = await tronWeb.trx.getChainParameters();
  const energyFeeSun = Number((chainParams || []).find((p) => p.key === 'getEnergyFee')?.value || 100);
  const estimatedCostSun = (ESTIMATED_DEPLOY_ENERGY * energyFeeSun) + NET_FEE_BUFFER_SUN;
  const requiredSun = Math.ceil(estimatedCostSun * 1.2);
  const requiredTrx = requiredSun / 1_000_000;

  console.log('⚙️  Energy price:', energyFeeSun, 'sun/energy');
  console.log('🧮 Estimated deploy cost:', (estimatedCostSun / 1_000_000).toFixed(3), 'TRX');
  console.log('🛡️  Recommended minimum:', requiredTrx.toFixed(3), 'TRX');

  if (balanceSun < requiredSun) {
    console.error('\n❌ Not enough TRX for safe deploy. Current:', balanceTrx.toFixed(4), 'TRX');
    console.error('   Recommended minimum:', requiredTrx.toFixed(3), 'TRX');
    console.error('   Top up wallet and retry to avoid partial burn.');
    process.exit(1);
  }

  const dynamicFeeLimitSun = Math.min(Math.ceil(requiredSun + 10_000_000), 250_000_000);

  console.log('\n⏳ Deploying contract...');

  const tx = await tronWeb.transactionBuilder.createSmartContract({
    abi:                CONTRACT_ABI,
    bytecode:           bytecode,
    feeLimit:           dynamicFeeLimitSun,
    callValue:          0,
    userFeePercentage:  100,
    originEnergyLimit:  10_000_000,
    name:               'CustomUSDT'
  }, address);

  const signedTx = await tronWeb.trx.sign(tx, PRIVATE_KEY);
  const result   = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!result.result) {
    console.error('❌ Deployment failed:', result);
    process.exit(1);
  }

  const txId            = result.txid;
  const contractAddress = tronWeb.address.fromHex(result.transaction.contract_address || '');

  // Wait for confirmation
  console.log('📡 Tx ID:', txId);
  console.log('⏳ Waiting for confirmation (~3 seconds)...');
  await new Promise(r => setTimeout(r, 6000));

  // Get confirmed contract address
  const txInfo = await tronWeb.trx.getTransactionInfo(txId);
  const confirmedAddress = txInfo.contract_address
    ? tronWeb.address.fromHex(txInfo.contract_address)
    : contractAddress;

  console.log('\n✅ CONTRACT DEPLOYED ON TRON!');
  console.log('📋 Contract address (TRON):', confirmedAddress);
  console.log('🔍 View on TronScan: https://tronscan.org/#/contract/' + confirmedAddress);
  console.log('\n⚠️  NEXT STEP — Update js/config.js:');
  console.log('   Find the "tron" network entry and set:');
  console.log('   usdtAddress: "' + confirmedAddress + '"');
  console.log('\n📱 To add the token in Exodus / Trust Wallet / TronLink:');
  console.log('   Network: TRON (TRC-20)');
  console.log('   Contract: ' + confirmedAddress);
  console.log('   Symbol: USDT');
  console.log('   Decimals: 6');
}

main().catch(console.error);
