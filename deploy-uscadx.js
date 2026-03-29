/**
 * USCA Dollar X (USCADX) — TRC-20 Deployment Script
 *
 * Works like USDT/USDC — simple deploy, full 1T supply goes to deployer.
 *
 * Modes:
 *   node deploy-uscadx.js             → Mainnet: estimation + confirmation obligatoire
 *   node deploy-uscadx.js --testnet   → Shasta testnet (TRX gratuit, zéro risque)
 *   node deploy-uscadx.js --estimate  → Montre le coût estimé seulement, ne dépense rien
 */

const { TronWeb } = require('tronweb');
const fs   = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const IS_TESTNET    = process.argv.includes('--testnet');
const ESTIMATE_ONLY = process.argv.includes('--estimate');

const PRIVATE_KEY = (process.env.PRIVATE_KEY || process.env.TRON_PRIVATE_KEY || '').replace(/^0x/, '');
const MAINNET_API = 'https://api.trongrid.io';
const TESTNET_API = 'https://api.shasta.trongrid.io';
const TRON_API    = IS_TESTNET ? TESTNET_API : (process.env.TRON_API || MAINNET_API);

const USCADX_ABI = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  { "inputs": [{"name":"account","type":"address"}], "name": "balanceOf", "outputs": [{"name":"","type":"uint256"}], "stateMutability": "view", "type": "function" },
  { "inputs": [{"name":"to","type":"address"},{"name":"value","type":"uint256"}], "name": "transfer", "outputs": [{"name":"","type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"spender","type":"address"},{"name":"value","type":"uint256"}], "name": "approve", "outputs": [{"name":"","type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"from","type":"address"},{"name":"to","type":"address"},{"name":"value","type":"uint256"}], "name": "transferFrom", "outputs": [{"name":"","type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "claimFaucet", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"account","type":"address"}], "name": "hasClaimed", "outputs": [{"name":"","type":"bool"}], "stateMutability": "view", "type": "function" },
  { "inputs": [{"name":"to","type":"address"},{"name":"amount","type":"uint256"}], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"target","type":"address"}], "name": "blockAddress", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"target","type":"address"}], "name": "unblockAddress", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [{"name":"","type":"address"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "name", "outputs": [{"name":"","type":"string"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "symbol", "outputs": [{"name":"","type":"string"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "decimals", "outputs": [{"name":"","type":"uint8"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "totalSupply", "outputs": [{"name":"","type":"uint256"}], "stateMutability": "view", "type": "function" },
  { "anonymous": false, "inputs": [{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}], "name": "Transfer", "type": "event" }
];

// Bytecode of USCADX_TRC20.sol (compile with solc 0.8.20)
// Run: npx solcjs --bin contracts/USCADX_TRC20.sol --output-dir build/
// Then add to .env:  USCADX_BYTECODE=<hex>
const BYTECODE = process.env.USCADX_BYTECODE || '';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Ask user a yes/no question — returns true if user types "oui" or "yes" */
async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + ' (oui/non) : ', answer => {
      rl.close();
      resolve(['oui', 'yes', 'o', 'y'].includes(answer.trim().toLowerCase()));
    });
  });
}

/**
 * Estimate deploy energy based on bytecode size + TRON EVM constants.
 * Formula: base cost + code_deposit (200 energy/byte) + execution opcodes
 */
async function estimateDeployEnergy(tronWeb, deployer, bytecode) {
  try {
    const params = await tronWeb.trx.getChainParameters();
    const energyFee = (params.find(p => p.key === 'getEnergyFee') || {}).value || 420;

    const byteLen = bytecode.replace(/^0x/, '').length / 2;

    const energyBase      = 53_000;
    const energyCodeStore = Math.ceil(byteLen * 200);
    const energyExecution = 120_000;
    const energyUsed      = energyBase + energyCodeStore + energyExecution;

    const bandwidthUsed = byteLen + 300;
    const trxCost = (energyUsed * energyFee + bandwidthUsed * 1000) / 1_000_000;

    return { energyUsed, bandwidthUsed, trxCost, energyFee, byteLen };
  } catch (e) {
    return null;
  }
}

async function waitConfirmed(tronWeb, txId, label) {
  process.stdout.write(`⏳ Waiting for ${label}...`);
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    try {
      const info = await tronWeb.trx.getTransactionInfo(txId);
      if (info && info.blockNumber) {
        const ok = !info.receipt || info.receipt.result !== 'FAILED';
        console.log(ok ? ' ✅' : ' ❌ FAILED');
        if (!ok) throw new Error(`TX failed: ${txId}`);
        return info;
      }
    } catch(e) { if (e.message.includes('failed')) throw e; }
    process.stdout.write('.');
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error('❌ Set PRIVATE_KEY ou TRON_PRIVATE_KEY dans .env');
    process.exit(1);
  }
  if (!BYTECODE) {
    console.error('❌ Set USCADX_BYTECODE dans .env');
    console.log('  Compiler: npx solcjs --bin contracts/USCADX_TRC20.sol --output-dir build/');
    console.log('  Puis ajouter dans .env:  USCADX_BYTECODE=<contenu du .bin>');
    process.exit(1);
  }

  const network = IS_TESTNET ? '🧪 SHASTA TESTNET (TRX gratuit)' : '🔵 MAINNET';
  const tronWeb = new TronWeb({ fullHost: TRON_API, privateKey: PRIVATE_KEY });
  const deployer = tronWeb.defaultAddress.base58;
  const bytecode = BYTECODE.replace(/^0x/, '');

  console.log('\n🚀 USCA Dollar X (USCADX) Deployment');
  console.log('=====================================');
  console.log('Réseau    :', network);
  console.log('Deployer  :', deployer);
  console.log('Supply    : 1 000 000 000 000 USCADX → deployer (+ faucet 500M/address)');
  console.log('Faucet    : claimFaucet() → 500 000 000 USCADX par adresse (1 fois)');

  // ── Estimation de coût ───────────────────────────────────────────────
  console.log('\n📐 Estimation du coût de déploiement...');
  const est = await estimateDeployEnergy(tronWeb, deployer, bytecode);
  if (est && est.energyUsed > 0) {
    console.log(`   Bytecode         : ${est.byteLen.toLocaleString()} bytes`);
    console.log(`   Energy estimée   : ${est.energyUsed.toLocaleString()} energy`);
    console.log(`     (base 53k + code_store ${Math.ceil(est.byteLen*200).toLocaleString()} + exec ~120k)`);
    console.log(`   Prix de l'énergie: ${est.energyFee} SUN/energy`);
    console.log(`   ─────────────────────────────────────`);
    console.log(`   💰 Déploiement   : ~${est.trxCost.toFixed(2)} TRX (sans énergie stakée)`);
    console.log(`      + distributions: ~15-25 TRX`);
    const totalEst = est.trxCost + 22;
    console.log(`   Total estimé     : ~${totalEst.toFixed(2)} TRX`);
    console.log(`   💡 Avec énergie stakée (freeze TRX) : quasi gratuit`);
  } else {
    console.log('   ⚠ Estimation indisponible — prévoyez 80-150 TRX.');
  }

  // ── Mode --estimate : s'arrêter ici ──────────────────────────────────
  if (ESTIMATE_ONLY) {
    console.log('\n✅ Mode --estimate : aucun TRX dépensé, aucun déploiement effectué.');
    process.exit(0);
  }

  // ── Vérifier le solde ────────────────────────────────────────────────
  const balSun = await tronWeb.trx.getBalance(deployer);
  const balTrx = balSun / 1_000_000;
  console.log('\n💰 Solde TRX      :', balTrx.toFixed(2), 'TRX');

  const minNeeded = est ? (est.trxCost + 20) : 80;
  if (!IS_TESTNET && balTrx < minNeeded) {
    console.error(`❌ Solde insuffisant. Estimé nécessaire: ~${minNeeded.toFixed(2)} TRX, Disponible: ${balTrx.toFixed(2)} TRX`);
    console.log(`   → Envoie au moins ${Math.ceil(minNeeded - balTrx)} TRX supplémentaires sur ${deployer}`);
    process.exit(1);
  }

  // ── Confirmation obligatoire sur mainnet ─────────────────────────────
  if (!IS_TESTNET) {
    const costLabel = est ? `~${(est.trxCost + 20).toFixed(2)} TRX` : '~80-150 TRX';
    console.log(`\n⚠  MAINNET — Cette action va dépenser ${costLabel} de façon irréversible.`);
    const ok = await confirm('Confirmer le déploiement USCADX sur TRON Mainnet ?');
    if (!ok) {
      console.log('❌ Déploiement annulé. Aucun TRX dépensé.');
      process.exit(0);
    }
  } else {
    console.log('\n🧪 Testnet — pas de confirmation requise.');
    if (balTrx < 1) {
      console.log('   ⚠ Solde testnet nul. Récupère du TRX sur https://www.trongrid.io/shasta');
      console.log(`   Wallet testnet : ${deployer}`);
      process.exit(1);
    }
  }

  // ── Deploy contract ──────────────────────────────────────────────────
  console.log('\n📦 Déploiement du contrat USCADX...');
  const feeLimitDeploy = est ? Math.ceil((est.trxCost * 1.5) * 1_000_000) : 200_000_000;

  let tx;
  try {
    tx = await tronWeb.transactionBuilder.createSmartContract({
      abi: USCADX_ABI,
      bytecode,
      feeLimit: Math.min(feeLimitDeploy, 300_000_000),
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 10_000_000,
      name: 'USCADX_TRC20'
    }, deployer);
  } catch (buildErr) {
    console.error('❌ Erreur lors de la construction de la TX:', buildErr.message || buildErr);
    console.log('   Aucun TRX dépensé.');
    process.exit(1);
  }

  const signedTx = await tronWeb.trx.sign(tx, PRIVATE_KEY);
  const result   = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!result.result) {
    console.error('❌ Déploiement rejeté par le réseau:', JSON.stringify(result));
    console.log('   Aucun TRX dépensé (tx non broadcast).');
    process.exit(1);
  }

  const txId = result.txid;
  console.log('📋 Deploy TX:', txId);
  console.log('🔍 TronScan TX:', IS_TESTNET
    ? `https://shasta.tronscan.org/#/transaction/${txId}`
    : `https://tronscan.org/#/transaction/${txId}`);

  const info = await waitConfirmed(tronWeb, txId, 'déploiement');

  if (info.fee) {
    console.log(`   💸 Coût réel: ${(info.fee / 1_000_000).toFixed(4)} TRX`);
  }

  const contractHex = info.contract_address;
  if (!contractHex) {
    console.error('❌ Adresse du contrat introuvable dans la réponse.');
    process.exit(1);
  }

  const contractAddress = tronWeb.address.fromHex(contractHex);
  console.log('\n✅ Contrat USCADX déployé !');
  console.log('📍 Adresse:', contractAddress);
  console.log('🔍 TronScan:', IS_TESTNET
    ? `https://shasta.tronscan.org/#/contract/${contractAddress}`
    : `https://tronscan.org/#/contract/${contractAddress}`);

  // ── Auto-patch config.js ─────────────────────────────────────────────
  if (!IS_TESTNET) {
    try {
      const configPath = path.join(__dirname, 'js', 'config.js');
      let cfg = fs.readFileSync(configPath, 'utf8');
      cfg = cfg.replace(
        /(\s*uscadx:\s*\{[\s\S]*?address:\s*)'[^']*'/,
        (m, pre) => pre + `'${contractAddress}'`
      );
      fs.writeFileSync(configPath, cfg, 'utf8');
      console.log('\n✅ js/config.js mis à jour automatiquement avec l\'adresse USCADX.');
    } catch (e) {
      console.log('\n⚠  Impossible de patcher config.js automatiquement.');
      console.log('   Mets à jour manuellement: uscadx.address = "' + contractAddress + '"');
    }
  }

  // ── Résultat ─────────────────────────────────────────────────────────
  console.log('\n✅ DÉPLOIEMENT USCADX TERMINÉ');
  console.log('════════════════════════════════════════');
  console.log('📍 Contrat USCADX :', contractAddress);
  console.log('════════════════════════════════════════\n');

  const result_out = {
    network: IS_TESTNET ? 'shasta-testnet' : 'mainnet',
    contractAddress,
    deployer,
    deployTxId: txId,
    tronscanUrl: IS_TESTNET
      ? `https://shasta.tronscan.org/#/contract/${contractAddress}`
      : `https://tronscan.org/#/contract/${contractAddress}`,
    deployedAt: new Date().toISOString()
  };
  fs.writeFileSync('uscadx-deploy-result.json', JSON.stringify(result_out, null, 2));
  console.log('💾 Résultat sauvegardé dans uscadx-deploy-result.json');

  if (!IS_TESTNET) {
    console.log('\n🚀 Prochaine étape: vercel --prod pour mettre en ligne la config mise à jour.');
  }
}

main().catch(e => {
  console.error('\n❌ Erreur fatale:', e.message || e);
  console.log('   Vérifie ta connexion et ton solde TRX.');
  process.exit(1);
});
