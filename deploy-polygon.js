/**
 * CustomUSDT Deployment Script — Polygon Mainnet
 * Deploys the custom USDT token to Polygon (cheap gas ~$0.001)
 *
 * Usage:
 *   1. npm install
 *   2. Create .env file:
 *        PRIVATE_KEY=your_metamask_private_key_here
 *   3. node deploy-polygon.js
 *
 * Get MATIC for gas (~$1 covers 100+ transactions):
 *   - Buy MATIC on Binance, Coinbase, Kraken
 *   - Send to your MetaMask address on Polygon network
 *
 * After deployment, update js/config.js:
 *   polygon.usdtAddress: "0xYOUR_DEPLOYED_ADDRESS"
 */

const { ethers } = require('ethers');
const fs         = require('fs');
require('dotenv').config();

// ===== CONFIGURATION =====
// Free public Polygon RPCs — tried in order until one works
const POLYGON_RPCS = [
  'https://polygon.llamarpc.com',
  'https://polygon-bor-rpc.publicnode.com',
  'https://1rpc.io/matic',
  'https://polygon.drpc.org',
  'https://polygon.meowrpc.com'
];
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

// ===== ABI (same contract as Sepolia) =====
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

// ===== BYTECODE — extracted from deploy.js at runtime =====
function getBytecode() {
  try {
    const src = fs.readFileSync('./deploy.js', 'utf8');
    const match = src.match(/const CONTRACT_BYTECODE\s*=\s*"(0x[0-9a-fA-F]+)"/);
    if (match && match[1]) return match[1];
  } catch (e) {}
  console.error('❌ Could not extract bytecode from deploy.js');
  process.exit(1);
}

// ===== MAIN =====
async function main() {
  if (!PRIVATE_KEY) {
    console.error('\n❌ ERROR: Set PRIVATE_KEY in .env file');
    console.log('\nCreate .env with:');
    console.log('PRIVATE_KEY=your_metamask_private_key_here\n');
    process.exit(1);
  }

  const bytecode = getBytecode();
  console.log('🚀 Deploying CustomUSDT to Polygon Mainnet...\n');

  // Try each RPC until one works
  let provider = null;
  let wallet   = null;
  for (const rpc of POLYGON_RPCS) {
    try {
      console.log('🔌 Trying RPC:', rpc);
      const p = new ethers.JsonRpcProvider(rpc);
      const w = new ethers.Wallet(PRIVATE_KEY, p);
      // Quick test — getBalance with 8s timeout
      await Promise.race([
        p.getBalance(w.address),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      ]);
      provider = p;
      wallet   = w;
      console.log('✅ Connected via:', rpc, '\n');
      break;
    } catch (e) {
      console.log('   ✗ Failed:', e.shortMessage || e.message);
    }
  }

  if (!provider) {
    console.error('\n❌ All RPCs failed. Check your internet connection or set POLYGON_RPC in .env');
    process.exit(1);
  }

  console.log('📍 Deployer address:', wallet.address);

  const maticBalance = await provider.getBalance(wallet.address);
  console.log('💰 MATIC balance:', ethers.formatEther(maticBalance), 'MATIC');

  if (maticBalance === 0n) {
    console.error('\n❌ No MATIC! Buy MATIC on Binance/Coinbase and send to:', wallet.address);
    console.error('   ~$1 worth of MATIC is enough for deployment + 100 transfers.\n');
    process.exit(1);
  }

  // Deploy
  const factory  = new ethers.ContractFactory(CONTRACT_ABI, bytecode, wallet);
  console.log('\n⏳ Deploying contract...');
  const contract = await factory.deploy();

  console.log('📡 Tx hash:', contract.deploymentTransaction().hash);
  console.log('⏳ Waiting for confirmation...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log('\n✅ CONTRACT DEPLOYED ON POLYGON!');
  console.log('📋 Contract address:', address);
  console.log('🔍 View on Polygonscan: https://polygonscan.com/address/' + address);
  console.log('\n⚠️  NEXT STEP — Update js/config.js:');
  console.log('   Find the "polygon" network entry and set:');
  console.log('   usdtAddress: "' + address + '"');
  console.log('\n📱 To add the token in Exodus / Trust Wallet / MetaMask:');
  console.log('   Network: Polygon');
  console.log('   Contract: ' + address);
  console.log('   Symbol: USDT');
  console.log('   Decimals: 6');
}

main().catch(console.error);
