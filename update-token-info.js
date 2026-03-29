﻿const { TronWeb } = require('tronweb');
require('dotenv').config();

const PRIVATE_KEY      = (process.env.TRON_PRIVATE_KEY || process.env.PRIVATE_KEY || '').replace(/^0x/, '');
const CONTRACT_ADDRESS = 'TA61FU9u8hSqQiwKpR9hUy6opfvDKPHqdz';
const WEBSITE          = 'https://sstr.digital';
const LOGO_URL         = WEBSITE + '/usdt-logo.png';

const TOKEN_INFO = {
  name:        'Tether USD',
  abbr:        'USDT',
  decimals:    6,
  logo:        LOGO_URL,
  url:         WEBSITE,
  description: 'USDT TRC-20 token on TRON Mainnet. 1 USDT = $1.00 USD. Transferable on USDT Sender (sstr.digital).',
};

async function submitToTronScan(tronWeb, ownerAddress) {
  const msgHex   = tronWeb.toHex(ownerAddress);
  const sig      = await tronWeb.trx.sign(msgHex, PRIVATE_KEY);
  const ownerHex = tronWeb.address.toHex(ownerAddress);

  const body = new URLSearchParams({
    contract:      CONTRACT_ADDRESS,
    owner_address: ownerHex,
    name:          TOKEN_INFO.name,
    abbr:          TOKEN_INFO.abbr,
    description:   TOKEN_INFO.description,
    url:           TOKEN_INFO.url,
    logo:          TOKEN_INFO.logo,
    sign:          sig,
  });

  console.log('\n📡 Envoi à TronScan API...');

  const endpoints = [
    'https://apilist.tronscanapi.com/api/token20/update',
    'https://apilist.tronscan.org/api/token20/update',
  ];

  for (const url of endpoints) {
    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      console.log('   Endpoint :', url);
      console.log('   Status   :', res.status);
      console.log('   Réponse  :', JSON.stringify(json, null, 2));

      if (res.status === 200 && (json.code === 0 || json.success || json.result)) {
        return { success: true, data: json };
      }
    } catch (e) {
      console.warn('   ⚠️  Endpoint échoué:', e.message);
    }
  }
  return { success: false };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' TronScan Auto-Submit — Token Info Updater');
  console.log('═══════════════════════════════════════════════════════\n');

  if (!PRIVATE_KEY) {
    console.error('❌ TRON_PRIVATE_KEY manquant dans .env');
    process.exit(1);
  }

  const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', privateKey: PRIVATE_KEY });
  const owner   = tronWeb.defaultAddress.base58;

  console.log('👤 Owner  :', owner);
  console.log('📄 Contrat:', CONTRACT_ADDRESS);
  console.log('🏷️  Nom    :', TOKEN_INFO.name);
  console.log('🔣 Symbole:', TOKEN_INFO.abbr);
  console.log('🖼️  Logo   :', TOKEN_INFO.logo);
  console.log('🌐 Site   :', TOKEN_INFO.url);

  try {
    const abi = [{ inputs:[], name:'owner', outputs:[{name:'',type:'address'}], stateMutability:'view', type:'function' }];
    const c         = await tronWeb.contract(abi, CONTRACT_ADDRESS);
    const ownerAddr = await c.owner().call();
    const ownerB58  = tronWeb.address.fromHex(ownerAddr);
    if (ownerB58 !== owner) {
      console.error('\n❌ Ce wallet n\'est pas l\'owner du contrat.');
      console.error('   Owner attendu :', ownerB58);
      process.exit(1);
    }
    console.log('\n✅ Ownership vérifié — tu es bien l\'owner.\n');
  } catch (e) {
    console.warn('⚠️  Vérification ownership échouée (rate limit) — on continue.\n');
  }

  const result = await submitToTronScan(tronWeb, owner);

  if (result.success) {
    console.log('\n✅ SUCCÈS — Token info soumis sur TronScan !');
    console.log('⏱️  Validation dans 24h à 72h.');
    console.log('📍 Vérifier sur : https://tronscan.org/#/token20/' + CONTRACT_ADDRESS);
  } else {
    console.log('\n⚠️  API automatique bloquée par TronScan (authentification navigateur requise).');
    console.log('\n📋 Fais-le manuellement en 5 min :');
    console.log('   1. https://tronscan.org/#/token20/' + CONTRACT_ADDRESS);
    console.log('   2. Connecte TronLink (wallet owner: ' + owner + ')');
    console.log('   3. Clique "Update Token Info" et remplis :');
    console.log('      Name        : ' + TOKEN_INFO.name);
    console.log('      Symbol      : ' + TOKEN_INFO.abbr);
    console.log('      Logo URL    : ' + TOKEN_INFO.logo);
    console.log('      Website     : ' + TOKEN_INFO.url);
    console.log('      Description : ' + TOKEN_INFO.description);
  }
  console.log('');
}

main().catch(e => {
  console.error('❌ Erreur:', e.message || e);
  process.exit(1);
});