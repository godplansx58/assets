/**
 * AfriChainX (AFRX) — TRC-20 Deployment Script
 *
 * Modes:
 *   node deploy-afrx.js             → Mainnet: estimation + confirmation obligatoire
 *   node deploy-afrx.js --testnet   → Shasta testnet (TRX gratuit, zéro risque)
 *   node deploy-afrx.js --estimate  → Montre le coût estimé seulement, ne dépense rien
 *
 * Distribution:
 *   500M (50%) → AFRX_PLATFORM_WALLET
 *   200M (20%) → LIQUIDITY_WALLET (SunSwap)
 *   200M (20%) → COMMUNITY_WALLET (airdrops)
 *   100M (10%) → deployer (dev fund)
 */

const { TronWeb } = require('tronweb');
const fs   = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const IS_TESTNET = process.argv.includes('--testnet');
const ESTIMATE_ONLY = process.argv.includes('--estimate');

const PRIVATE_KEY          = (process.env.PRIVATE_KEY || process.env.TRON_PRIVATE_KEY || '').replace(/^0x/, '');
const MAINNET_API          = 'https://api.trongrid.io';
const TESTNET_API          = 'https://api.shasta.trongrid.io';
const TRON_API             = IS_TESTNET ? TESTNET_API : (process.env.TRON_API || MAINNET_API);

// Distribution wallets
const AFRX_PLATFORM_WALLET = process.env.AFRX_PLATFORM_WALLET || 'TWCyjobnSPKvmYUJ3JYfKa98cBZ5bTXo3n';
const LIQUIDITY_WALLET     = process.env.LIQUIDITY_WALLET || '';
const COMMUNITY_WALLET     = process.env.COMMUNITY_WALLET || '';

const DECIMALS = 18;
const ONE      = BigInt(10) ** BigInt(DECIMALS);

const TOTAL_SUPPLY    = 1_000_000_000n * ONE;
const PLATFORM_AMOUNT = 500_000_000n  * ONE; // 50%
const LIQUIDITY_AMOUNT= 200_000_000n  * ONE; // 20%
const COMMUNITY_AMOUNT= 200_000_000n  * ONE; // 20%
// 100M (10%) stays with deployer as dev fund

const AFRX_ABI = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  { "inputs": [{"name":"account","type":"address"}], "name": "balanceOf", "outputs": [{"name":"","type":"uint256"}], "stateMutability": "view", "type": "function" },
  { "inputs": [{"name":"to","type":"address"},{"name":"value","type":"uint256"}], "name": "transfer", "outputs": [{"name":"","type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"spender","type":"address"},{"name":"value","type":"uint256"}], "name": "approve", "outputs": [{"name":"","type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"from","type":"address"},{"name":"to","type":"address"},{"name":"value","type":"uint256"}], "name": "transferFrom", "outputs": [{"name":"","type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"to","type":"address"},{"name":"amount","type":"uint256"}], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"amount","type":"uint256"}], "name": "burn", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"recipients","type":"address[]"},{"name":"amountEach","type":"uint256"}], "name": "batchTransfer", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"addr","type":"address"},{"name":"enabled","type":"bool"}], "name": "setFeeDiscount", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [{"name":"","type":"address"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "name", "outputs": [{"name":"","type":"string"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "symbol", "outputs": [{"name":"","type":"string"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "decimals", "outputs": [{"name":"","type":"uint8"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "totalSupply", "outputs": [{"name":"","type":"uint256"}], "stateMutability": "view", "type": "function" },
  { "anonymous": false, "inputs": [{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}], "name": "Transfer", "type": "event" }
];

// Bytecode of AFRX_TRC20.sol (compile with solc 0.8.20)
// Run: npx solc --bin contracts/AFRX_TRC20.sol → paste output here
const BYTECODE = process.env.AFRX_BYTECODE || '';

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
 * Formula per TRON docs: base cost + code_deposit (200 energy/byte) + execution opcodes
 * Returns { energyUsed, bandwidthUsed, trxCost } — no broadcast.
 */
async function estimateDeployEnergy(tronWeb, deployer, bytecode) {
  try {
    const params = await tronWeb.trx.getChainParameters();
    const energyFee = (params.find(p => p.key === 'getEnergyFee') || {}).value || 420; // sun per energy

    // Bytecode size in bytes
    const byteLen = bytecode.replace(/^0x/, '').length / 2;

    // TRON EVM constants (same as Ethereum at core):
    //  - TxCreate base:          53000 energy
    //  - Code deposit per byte:    200 energy/byte (EIP-170)
    //  - Execution opcodes:   ~50k-150k energy for a typical TRC-20 constructor
    const energyBase      = 53_000;
    const energyCodeStore = Math.ceil(byteLen * 200);
    const energyExecution = 120_000; // typical TRC-20 constructor (mint 1B tokens etc.)
    const energyUsed      = energyBase + energyCodeStore + energyExecution;

    // Bandwidth = raw tx bytes. Deployment tx is roughly: bytecode + ~300 bytes overhead
    const bandwidthUsed = byteLen + 300;

    // TRX cost if no staked energy (worst case):  energy × energyFee + bw × 1000 sun
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
    console.error('❌ Set AFRX_BYTECODE dans .env');
    console.log('  Compiler: npx solcjs --bin contracts/AFRX_TRC20.sol --output-dir build/');
    console.log('  Puis:     Add-Content .env "AFRX_BYTECODE=$(cat build/*.bin)"');
    process.exit(1);
  }

  const network = IS_TESTNET ? '🧪 SHASTA TESTNET (TRX gratuit)' : '🔴 MAINNET';
  const tronWeb = new TronWeb({ fullHost: TRON_API, privateKey: PRIVATE_KEY });
  const deployer = tronWeb.defaultAddress.base58;
  const bytecode = BYTECODE.replace(/^0x/, '');

  console.log('\n🚀 AfriChainX (AFRX) Deployment');
  console.log('================================');
  console.log('Réseau    :', network);
  console.log('Deployer  :', deployer);
  console.log('Platform  :', AFRX_PLATFORM_WALLET, '(500M — 50%)');
  console.log('Liquidity :', LIQUIDITY_WALLET || '⚠ Non défini — 200M reste chez deployer');
  console.log('Community :', COMMUNITY_WALLET || '⚠ Non défini — 200M reste chez deployer');

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
    console.log('   ⚠ Estimation indisponible — le coût réel sera visible après confirmation.');
    console.log('   Prévoyez 80-150 TRX pour être sûr.');
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
    const ok = await confirm('Confirmer le déploiement sur TRON Mainnet ?');
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
  console.log('\n📦 Déploiement du contrat...');
  const feeLimitDeploy = est ? Math.ceil((est.trxCost * 1.5) * 1_000_000) : 200_000_000;

  let tx;
  try {
    tx = await tronWeb.transactionBuilder.createSmartContract({
      abi: AFRX_ABI,
      bytecode,
      feeLimit: Math.min(feeLimitDeploy, 300_000_000),
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 10_000_000,
      name: 'AFRX_TRC20'
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

  // Attendre confirmation (si la TX échoue on le saura ici)
  const info = await waitConfirmed(tronWeb, txId, 'déploiement');

  // Lire le coût réel
  if (info.fee) {
    console.log(`   💸 Coût réel: ${(info.fee / 1_000_000).toFixed(4)} TRX`);
  }

  const contractHex = info.contract_address;
  if (!contractHex) {
    console.error('❌ Adresse du contrat introuvable dans la réponse.');
    process.exit(1);
  }

  const contractAddress = tronWeb.address.fromHex(contractHex);
  console.log('\n✅ Contrat déployé !');
  console.log('📍 Adresse:', contractAddress);
  console.log('🔍 TronScan:', IS_TESTNET
    ? `https://shasta.tronscan.org/#/contract/${contractAddress}`
    : `https://tronscan.org/#/contract/${contractAddress}`);

  // ── Distribuer les tokens ────────────────────────────────────────────
  const contract = await tronWeb.contract(AFRX_ABI, contractAddress);
  console.log('\n💸 Distribution des tokens...');

  // 1. Platform wallet (500M — 50%)
  console.log(`\n→ Envoi 500M vers Platform (${AFRX_PLATFORM_WALLET})...`);
  const tx1 = await contract.transfer(AFRX_PLATFORM_WALLET, PLATFORM_AMOUNT.toString()).send({ feeLimit: 60_000_000 });
  await waitConfirmed(tronWeb, tx1, '500M → Platform');

  // 2. Liquidity wallet (200M — 20%)
  if (LIQUIDITY_WALLET) {
    console.log(`\n→ Envoi 200M vers Liquidité (${LIQUIDITY_WALLET})...`);
    const tx2 = await contract.transfer(LIQUIDITY_WALLET, LIQUIDITY_AMOUNT.toString()).send({ feeLimit: 60_000_000 });
    await waitConfirmed(tronWeb, tx2, '200M → Liquidity');
  } else {
    console.log('⚠  LIQUIDITY_WALLET non défini — 200M reste chez le deployer');
  }

  // 3. Community wallet (200M — 20%)
  if (COMMUNITY_WALLET) {
    console.log(`\n→ Envoi 200M vers Communauté (${COMMUNITY_WALLET})...`);
    const tx3 = await contract.transfer(COMMUNITY_WALLET, COMMUNITY_AMOUNT.toString()).send({ feeLimit: 60_000_000 });
    await waitConfirmed(tronWeb, tx3, '200M → Community');
  } else {
    console.log('⚠  COMMUNITY_WALLET non défini — 200M reste chez le deployer');
  }

  // 4. Fee discount pour platform wallet
  console.log('\n→ Activation fee discount pour platform wallet...');
  const txFee = await contract.setFeeDiscount(AFRX_PLATFORM_WALLET, true).send({ feeLimit: 30_000_000 });
  await waitConfirmed(tronWeb, txFee, 'fee discount');

  // ── Soldes finaux ────────────────────────────────────────────────────
  console.log('\n📊 Soldes finaux:');
  const bals = [
    [deployer,             'Deployer (dev fund)'],
    [AFRX_PLATFORM_WALLET, 'Platform wallet'],
    ...(LIQUIDITY_WALLET  ? [[LIQUIDITY_WALLET,  'Liquidity wallet']] : []),
    ...(COMMUNITY_WALLET  ? [[COMMUNITY_WALLET,  'Community wallet']] : []),
  ];
  for (const [addr, label] of bals) {
    try {
      const b = await contract.balanceOf(addr).call();
      const formatted = (Number(BigInt(b.toString()) / ONE)).toLocaleString();
      console.log(`  ${label}: ${formatted} AFRX`);
    } catch (e) { console.log(`  ${label}: erreur lecture solde`); }
  }

  // ── Auto-patch config.js ─────────────────────────────────────────────
  if (!IS_TESTNET) {
    try {
      const configPath = path.join(__dirname, 'js', 'config.js');
      let cfg = fs.readFileSync(configPath, 'utf8');
      // Replace afrx address: '' with actual address
      cfg = cfg.replace(
        /(\s*afrx:\s*\{[\s\S]*?address:\s*)'[^']*'/,
        (m, pre) => pre + `'${contractAddress}'`
      );
      fs.writeFileSync(configPath, cfg, 'utf8');
      console.log('\n✅ js/config.js mis à jour automatiquement avec l\'adresse AFRX.');
    } catch (e) {
      console.log('\n⚠  Impossible de patcher config.js automatiquement.');
      console.log('   Mets à jour manuellement: afrx.address = "' + contractAddress + '"');
    }
  }

  // ── Résultat ─────────────────────────────────────────────────────────
  console.log('\n✅ DÉPLOIEMENT TERMINÉ');
  console.log('════════════════════════════════════════');
  console.log('📍 Contrat AFRX :', contractAddress);
  console.log('════════════════════════════════════════\n');

  const result_out = {
    network: IS_TESTNET ? 'shasta-testnet' : 'mainnet',
    contractAddress,
    deployer,
    platformWallet: AFRX_PLATFORM_WALLET,
    deployTxId: txId,
    tronscanUrl: IS_TESTNET
      ? `https://shasta.tronscan.org/#/contract/${contractAddress}`
      : `https://tronscan.org/#/contract/${contractAddress}`,
    deployedAt: new Date().toISOString()
  };
  fs.writeFileSync('afrx-deploy-result.json', JSON.stringify(result_out, null, 2));
  console.log('💾 Résultat sauvegardé dans afrx-deploy-result.json');

  if (!IS_TESTNET) {
    console.log('\n🚀 Prochaine étape: vercel --prod pour mettre en ligne la config mise à jour.');
  }
}

main().catch(e => {
  console.error('\n❌ Erreur fatale:', e.message || e);
  console.log('   Vérifie ta connexion et ton solde TRX.');
  process.exit(1);
});
