/**
 * CustomUSDC TRC-20 Deployment Script — TRON Mainnet
 * Deploys the custom USDC token to TRON (cheap gas ~1-5 TRX per tx)
 *
 * Usage:
 *   1. npm install tronweb
 *   2. Create .env file:
 *        PRIVATE_KEY=your_tronlink_private_key_hex
 *   3. node deploy-usdc-tron.js
 *
 * Get TRX for gas (~10 TRX = ~$1, enough for deployment + many transfers):
 *   - Buy TRX on Binance, Coinbase, Kraken
 *   - Send to your TronLink address (starts with T)
 *
 * After deployment, update js/config.js:
 *   tron.tokens.usdc.address: "T..."
 */

const { TronWeb } = require('tronweb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').replace(/^0x/, '');
const TRON_API = process.env.TRON_API || 'https://api.trongrid.io';
const ESTIMATED_DEPLOY_ENERGY = 520_000;
const NET_FEE_BUFFER_SUN = 6_000_000; // ~6 TRX

// ===== ABI =====
const CONTRACT_ABI = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  { "inputs": [{ "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "to", "type": "address" }, { "name": "value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
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

async function main() {
  if (!PRIVATE_KEY) {
    console.error('\n❌ ERROR: Set PRIVATE_KEY in .env file');
    console.log('PRIVATE_KEY=your_tronlink_private_key_hex\n');
    process.exit(1);
  }

  // Read TRC-20 bytecode (strip 0x prefix for TronWeb)
  const bytecodeRaw = fs.readFileSync(
    path.join(__dirname, '_trc20_bytecode.txt'), 'utf8'
  ).trim();
  const bytecode = bytecodeRaw.replace(/^0x/, '');

  const tronWeb = new TronWeb({
    fullHost: TRON_API,
    privateKey: PRIVATE_KEY
  });

  const address = tronWeb.defaultAddress.base58;
  console.log('🚀 Deploying CustomUSDC TRC-20 to TRON Mainnet...\n');
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

  console.log('\n⏳ Broadcasting deploy transaction...');

  const tx = await tronWeb.transactionBuilder.createSmartContract(
    {
      abi: CONTRACT_ABI,
      bytecode,
      feeLimit: dynamicFeeLimitSun,
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 10_000_000,
      name: 'CustomUSDC'
    },
    address
  );

  const signed = await tronWeb.trx.sign(tx);
  const result = await tronWeb.trx.sendRawTransaction(signed);

  if (!result.result) {
    console.error('\n❌ Broadcast failed:', JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const txId = result.txid || result.transaction?.txID;
  console.log(`📡 Transaction ID: ${txId}`);
  console.log('⏳ Waiting for confirmation (~30 seconds)...');

  // Poll for confirmation
  let contractAddress = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const info = await tronWeb.trx.getTransactionInfo(txId);
      if (info && info.contract_address) {
        contractAddress = tronWeb.address.fromHex(info.contract_address);
        break;
      }
    } catch (e) { /* not yet confirmed */ }
    process.stdout.write('.');
  }
  console.log('');

  if (!contractAddress) {
    console.error('\n❌ Could not confirm deployment. Check TronScan manually:');
    console.error(`   https://tronscan.org/#/transaction/${txId}`);
    process.exit(1);
  }

  console.log(`\n✅ USDC CONTRACT DEPLOYED SUCCESSFULLY!`);
  console.log(`📋 Contract address: ${contractAddress}`);
  console.log(`🔍 View on TronScan: https://tronscan.org/#/contract/${contractAddress}`);
  console.log(`\n⚠️  IMPORTANT: Update js/config.js with this contract address:`);
  console.log(`   tron.tokens.usdc.address: "${contractAddress}"`);
}

main().catch(console.error);
