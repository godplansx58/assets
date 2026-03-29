/**
 * CustomUSDC Deployment Script — Polygon Mainnet
 * Deploys the custom USDC token to Polygon (cheap gas ~$0.001)
 *
 * Usage:
 *   1. npm install
 *   2. Create .env file:
 *        PRIVATE_KEY=your_metamask_private_key_here
 *   3. node deploy-usdc-polygon.js
 *
 * Get MATIC for gas (~$1 covers 100+ transactions):
 *   - Buy MATIC on Binance, Coinbase, Kraken
 *   - Send to your MetaMask address on Polygon network
 *
 * After deployment, update js/config.js:
 *   polygon.tokens.usdc.address: "0xYOUR_DEPLOYED_ADDRESS"
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ===== CONFIGURATION =====
const POLYGON_RPCS = [
  'https://polygon.llamarpc.com',
  'https://polygon-bor-rpc.publicnode.com',
  'https://1rpc.io/matic',
  'https://polygon.drpc.org',
  'https://polygon.meowrpc.com'
];
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

// ===== CONTRACT ABI =====
const CONTRACT_ABI = [
  'constructor()',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function claimFaucet()',
  'function hasClaimed(address) view returns (bool)',
  'function mint(address to, uint256 amount)',
  'function owner() view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event FaucetClaim(address indexed claimant, uint256 amount)'
];

// Bytecode compiled from contracts/CustomUSDC.sol (solc 0.8.20)
const CONTRACT_BYTECODE = fs.readFileSync(
  path.join(__dirname, '_erc20_bytecode.txt'), 'utf8'
).trim();

async function main() {
  if (!PRIVATE_KEY) {
    console.error('\n❌ ERROR: Set PRIVATE_KEY in .env file');
    console.log('\nCreate .env with:');
    console.log('PRIVATE_KEY=your_metamask_private_key_here\n');
    process.exit(1);
  }

  console.log('🚀 Deploying CustomUSDC to Polygon Mainnet...\n');

  // Try each RPC until one works
  let provider = null;
  let wallet = null;
  for (const rpc of POLYGON_RPCS) {
    try {
      console.log('🔌 Trying RPC:', rpc);
      const p = new ethers.JsonRpcProvider(rpc);
      const w = new ethers.Wallet(PRIVATE_KEY, p);
      await Promise.race([
        p.getBalance(w.address),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      ]);
      provider = p;
      wallet = w;
      console.log('✅ Connected via:', rpc, '\n');
      break;
    } catch (e) {
      console.log('   ✗ Failed:', e.shortMessage || e.message);
    }
  }

  if (!provider) {
    console.error('\n❌ All RPCs failed. Check your internet connection.');
    process.exit(1);
  }

  console.log(`📍 Deployer address: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  const matic = parseFloat(ethers.formatEther(balance));
  console.log(`💰 MATIC balance: ${matic.toFixed(4)} MATIC`);

  if (matic < 0.01) {
    console.error('\n❌ Not enough MATIC! Need at least 0.01 MATIC for gas.');
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(CONTRACT_ABI, CONTRACT_BYTECODE, wallet);

  console.log('\n⏳ Deploying CustomUSDC contract...');
  const contract = await factory.deploy();

  console.log(`📡 Transaction hash: ${contract.deploymentTransaction().hash}`);
  console.log('⏳ Waiting for confirmation...');

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\n✅ USDC CONTRACT DEPLOYED SUCCESSFULLY!`);
  console.log(`📋 Contract address: ${address}`);
  console.log(`🔍 View on Polygonscan: https://polygonscan.com/address/${address}`);
  console.log(`\n⚠️  IMPORTANT: Update js/config.js with this contract address:`);
  console.log(`   polygon.tokens.usdc.address: "${address}"`);
}

main().catch(console.error);
