/**
 * CustomUSDC Deployment Script
 * Deploys the custom USDC token to Sepolia testnet
 *
 * Usage:
 *   1. npm install
 *   2. Set PRIVATE_KEY in .env or directly below
 *   3. node deploy-usdc.js
 *
 * After deployment, update js/config.js:
 *   sepolia.tokens.usdc.address: "0xYOUR_DEPLOYED_ADDRESS"
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ===== CONFIGURATION =====
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

// ===== CONTRACT ABI & BYTECODE =====
const CONTRACT_ABI = [
  "constructor()",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function claimFaucet()",
  "function hasClaimed(address) view returns (bool)",
  "function mint(address to, uint256 amount)",
  "function owner() view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event FaucetClaim(address indexed claimant, uint256 amount)"
];

// Bytecode compiled from contracts/CustomUSDC.sol (solc 0.8.20)
const CONTRACT_BYTECODE = fs.readFileSync(
  path.join(__dirname, '_erc20_bytecode.txt'), 'utf8'
).trim();

async function main() {
  if (!PRIVATE_KEY) {
    console.error('❌ ERROR: Please set your PRIVATE_KEY in .env file');
    console.log('\nCreate a .env file with:');
    console.log('PRIVATE_KEY=your_metamask_private_key_here');
    console.log('\nGet free Sepolia ETH at: https://sepoliafaucet.com');
    process.exit(1);
  }

  console.log('🚀 Deploying CustomUSDC to Sepolia testnet...\n');

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`📍 Deployer address: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 ETH balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error('\n❌ No Sepolia ETH! Get free ETH at: https://sepoliafaucet.com');
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
  console.log(`🔍 View on Etherscan: https://sepolia.etherscan.io/address/${address}`);
  console.log(`\n⚠️  IMPORTANT: Update js/config.js with this contract address:`);
  console.log(`   sepolia.tokens.usdc.address: "${address}"`);
}

main().catch(console.error);
