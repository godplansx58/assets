/**
 * redeploy-tron.js
 * Compiles CustomUSDT_TRC20.sol with solc and deploys USDT to TRON Mainnet.
 * Automatically updates js/config.js with the new contract address.
 *
 * Usage:
 *   node redeploy-tron.js
 *
 * Requirements:
 *   - .env file with PRIVATE_KEY=<your tronlink private key hex>
 *   - TRX balance >= 10 TRX on the deployer address
 */

const { TronWeb } = require('tronweb');
const solc        = require('solc');
const fs          = require('fs');
const path        = require('path');
require('dotenv').config();

const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').replace(/^0x/, '');
const TRON_API    = process.env.TRON_API || 'https://api.trongrid.io';
const ESTIMATED_DEPLOY_ENERGY = 520_000;
const NET_FEE_BUFFER_SUN = 6_000_000; // ~6 TRX

// ── 1. Compile ────────────────────────────────────────────────────────────────
function compile() {
  // Use FULL TRC-20 contract — required by TronScan token registry (needs approve/transferFrom/allowance)
  const contractFile = 'CustomUSDT_TRC20.sol';
  const contractName = 'CustomUSDT_TRC20';
  const contractPath = path.join(__dirname, 'contracts', contractFile);
  const source       = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: { [contractFile]: { content: source } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
      // runs:200 for full TRC-20 compliance — costs ~60-80 TRX
      optimizer: { enabled: true, runs: 200 }
    }
  };

  console.log('🔨 Compiling ' + contractFile + ' with solc@0.8.20 (full TRC-20 compliant)...');
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  // Report warnings / errors
  if (output.errors && output.errors.length > 0) {
    output.errors.forEach(e => {
      if (e.severity === 'error') {
        console.error('❌ Compile error:', e.formattedMessage);
      } else {
        console.warn('⚠️  Warning:', e.formattedMessage);
      }
    });
    const hasErrors = output.errors.some(e => e.severity === 'error');
    if (hasErrors) process.exit(1);
  }

  const contract = output.contracts[contractFile][contractName];
  if (!contract) {
    console.error('❌ Contract "' + contractName + '" not found in compiler output');
    process.exit(1);
  }

  const bytecode = contract.evm.bytecode.object;
  const abi      = contract.abi;

  console.log('✅ Compilation successful');
  console.log('   Bytecode length:', bytecode.length / 2, 'bytes');
  console.log('   ABI functions:', abi.filter(x => x.type === 'function').map(x => x.name).join(', '));

  return { abi, bytecode };
}

// ── 2. Update js/config.js ────────────────────────────────────────────────────
function updateConfig(newAddress) {
  const configPath = path.join(__dirname, 'js', 'config.js');
  let src = fs.readFileSync(configPath, 'utf8');

  // Replace the usdtAddress in the tron block
  const updated = src.replace(
    /(tron:\s*\{[\s\S]*?usdtAddress:\s*')[^']*(')/,
    `$1${newAddress}$2`
  );

  if (updated === src) {
    console.warn('⚠️  Could not auto-update js/config.js — update manually:');
    console.warn(`   tron.usdtAddress: "${newAddress}"`);
  } else {
    fs.writeFileSync(configPath, updated, 'utf8');
    console.log('✅ js/config.js updated with new contract address');
  }
}

// ── 3. Main ───────────────────────────────────────────────────────────────────
async function main() {
  if (!PRIVATE_KEY) {
    console.error('\n❌ ERROR: Set PRIVATE_KEY in .env file');
    console.log('   PRIVATE_KEY=your_tronlink_private_key_hex\n');
    process.exit(1);
  }

  // Compile
  const { abi, bytecode } = compile();

  // Connect to TRON
  const tronWeb = new TronWeb({ fullHost: TRON_API, privateKey: PRIVATE_KEY });
  const deployer = tronWeb.defaultAddress.base58;

  console.log('\n🚀 Deploying to TRON Mainnet...');
  console.log('📍 Deployer:', deployer);

  // Check TRX balance
  const balanceSun = await tronWeb.trx.getBalance(deployer);
  const balanceTrx = balanceSun / 1_000_000;
  console.log('💰 TRX balance:', balanceTrx.toFixed(4), 'TRX');

  const chainParams = await tronWeb.trx.getChainParameters();
  const energyFeeSun = Number((chainParams || []).find((p) => p.key === 'getEnergyFee')?.value || 100);
  const estimatedCostSun = (ESTIMATED_DEPLOY_ENERGY * energyFeeSun) + NET_FEE_BUFFER_SUN;
  const requiredSun = Math.ceil(estimatedCostSun * 1.2); // safety margin
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

  // Build deploy transaction
  console.log('\n⏳ Building deploy transaction...');
  const tx = await tronWeb.transactionBuilder.createSmartContract(
    {
      abi:               abi,
      bytecode:          bytecode,          // ← freshly compiled, complete bytecode
      feeLimit:          dynamicFeeLimitSun,
      callValue:         0,
      userFeePercentage: 100,
      originEnergyLimit: 10_000_000,
      name:              'CustomUSDT'
    },
    deployer
  );

  // Sign & broadcast
  console.log('✍️  Signing transaction...');
  const signedTx = await tronWeb.trx.sign(tx, PRIVATE_KEY);

  console.log('📡 Broadcasting...');
  const result = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!result.result) {
    console.error('❌ Deployment failed:', JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const txId = result.txid;
  console.log('📡 Tx ID:', txId);
  console.log('⏳ Waiting 8s for confirmation...');
  await new Promise(r => setTimeout(r, 8000));

  // Get confirmed contract address
  const txInfo = await tronWeb.trx.getTransactionInfo(txId);

  // Check if tx failed
  if (txInfo.result === 'FAILED') {
    const msg = txInfo.resMessage
      ? Buffer.from(txInfo.resMessage, 'hex').toString('utf8')
      : 'Unknown error';
    console.error('\n❌ Transaction FAILED on-chain:', msg);
    console.error('   → Not enough energy. Send more TRX to:', deployer);
    process.exit(1);
  }

  let contractAddress = '';
  if (txInfo.contract_address) {
    contractAddress = tronWeb.address.fromHex(txInfo.contract_address);
    console.log('📋 Contract address (from txInfo):', contractAddress);
  } else {
    // Fallback: derive from broadcasted result
    const hexAddr = result.transaction && result.transaction.contract_address;
    contractAddress = hexAddr ? tronWeb.address.fromHex(hexAddr) : '(unknown)';
    console.log('📋 Contract address (fallback):', contractAddress);
  }

  console.log('\n✅ CONTRACT DEPLOYED ON TRON MAINNET!');
  console.log('📋 Contract address (base58):', contractAddress);
  console.log('🔍 TronScan: https://tronscan.org/#/contract/' + contractAddress);

  // Verify: call name() on the deployed contract
  console.log('\n🔍 Verifying contract...');
  try {
    await new Promise(r => setTimeout(r, 3000)); // wait for propagation
    const contract = await tronWeb.contract(abi, contractAddress);
    const name     = await contract.name().call();
    const symbol   = await contract.symbol().call();
    const decimals = await contract.decimals().call();
    const supply   = await contract.totalSupply().call();
    console.log('   name()       =', name);
    console.log('   symbol()     =', symbol);
    console.log('   decimals()   =', decimals.toString());
    console.log('   totalSupply()=', (BigInt(supply.toString()) / BigInt(10 ** 6)).toLocaleString(), 'USDT');
    console.log('✅ Contract verified — TRC-20 functions respond correctly');
  } catch (e) {
    console.warn('⚠️  Verification call failed (contract may still be propagating):', e.message || e);
    console.warn('   Wait 30s then check TronScan manually.');
  }

  // Update config
  if (contractAddress && contractAddress !== '(unknown)') {
    updateConfig(contractAddress);
  }

  console.log('\n📱 To add the token in Exodus / Trust Wallet / TronLink:');
  console.log('   Network:  TRON (TRC-20)');
  console.log('   Contract:', contractAddress);
  console.log('   Symbol:   USDT');
  console.log('   Decimals: 6');
  console.log('\n🎉 Done! Refresh the app (Ctrl+Shift+R) to use the new contract.');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message || err);
  process.exit(1);
});
