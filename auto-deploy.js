/**
 * auto-deploy.js
 * ============================================================
 * Automatically:
 *  1. Compiles contracts/CustomUSDT.sol  (via solc)
 *  2. Generates a fresh deployer wallet
 *  3. Gets Sepolia ETH via pk910.de PoW faucet (WebSocket)
 *  4. Deploys the contract on Sepolia
 *  5. Mints 500,000,000 USDT → your wallet
 *  6. Updates js/config.js with the contract address
 *
 * Usage:
 *   npm install
 *   node auto-deploy.js
 * ============================================================
 */

'use strict';

const { ethers } = require('ethers');
const WebSocket  = require('ws');
const crypto     = require('crypto');
const fs         = require('fs');
const path       = require('path');
const solc       = require('solc');

// ─── USER CONFIG ────────────────────────────────────────────
const USER_WALLET  = '0x17E6f56Eb15EF3FB37ef4d5b8d557824063707E1';
const FAUCET_WS    = 'wss://sepolia-faucet.pk910.de/';
const MIN_ETH      = ethers.parseEther('0.005');   // 0.005 ETH minimum to deploy

// Multiple RPC fallbacks (in case one is down)
const SEPOLIA_RPCS = [
  'https://sepolia.drpc.org',
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://1rpc.io/sepolia',
  'https://rpc2.sepolia.org',
  'https://rpc.sepolia.org'
];

// Accept existing private key via --key argument (e.g. node auto-deploy.js --key 0x...)
const KEY_ARG = process.argv.find((a, i) => process.argv[i-1] === '--key');
// ────────────────────────────────────────────────────────────

// ─── RPC WITH FALLBACK ───────────────────────────────────────
async function getWorkingProvider() {
  for (const rpc of SEPOLIA_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(rpc);
      await Promise.race([
        p.getBlockNumber(),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
      ]);
      console.log(`✅ RPC connected: ${rpc}`);
      return p;
    } catch {
      console.log(`⚠️  RPC failed: ${rpc}`);
    }
  }
  throw new Error('All Sepolia RPC endpoints failed. Check your internet connection.');
}

// ─── STEP 1 : COMPILE ───────────────────────────────────────
function compileContract() {
  console.log('\n📦 Compiling contracts/CustomUSDT.sol...');
  const source = fs.readFileSync(
    path.join(__dirname, 'contracts', 'CustomUSDT.sol'), 'utf8'
  );

  const input = {
    language: 'Solidity',
    sources: { 'CustomUSDT.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      throw new Error('Compilation failed:\n' + errors.map(e => e.formattedMessage).join('\n'));
    }
    output.errors.forEach(w => console.warn('  ⚠️ ', w.message));
  }

  const contract = output.contracts['CustomUSDT.sol']['CustomUSDT'];
  console.log('✅ Compilation successful');
  return {
    abi:      contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object
  };
}

// ─── STEP 2 : POW MINING HELPERS ────────────────────────────
function sha256hex(hexInput) {
  return crypto.createHash('sha256')
    .update(Buffer.from(hexInput, 'hex'))
    .digest('hex');
}

function countLeadingZeroBits(hashHex) {
  let count = 0;
  for (let i = 0; i < hashHex.length; i++) {
    const n = parseInt(hashHex[i], 16);
    if      (n === 0) { count += 4; }
    else if (n < 2)   { count += 3; break; }
    else if (n < 4)   { count += 2; break; }
    else if (n < 8)   { count += 1; break; }
    else              { break; }
  }
  return count;
}

/** Mine one share: find nonce where sha256(preimage+nonceHex) has ≥ difficulty leading zero bits */
function mineShare(preimage, difficulty) {
  return new Promise(resolve => {
    // Start from a random nonce to avoid collisions if run multiple times
    let nonce     = Math.floor(Math.random() * 0xFFFF);
    let count     = 0;
    const t0      = Date.now();

    function batch() {
      for (let i = 0; i < 60000; i++) {
        let nonceHex = nonce.toString(16);
        if (nonceHex.length % 2 !== 0) nonceHex = '0' + nonceHex;
        const hash = sha256hex(preimage + nonceHex);
        if (countLeadingZeroBits(hash) >= difficulty) {
          const elapsed  = (Date.now() - t0) / 1000;
          const hashrate = Math.floor(count / elapsed);
          process.stdout.write('\n');
          resolve({ nonce, hashrate });
          return;
        }
        nonce++;
        count++;
      }
      const elapsed  = (Date.now() - t0) / 1000 || 0.001;
      const hashrate = Math.floor(count / elapsed);
      process.stdout.write(
        `\r⛏️  Mining... ${(count / 1000).toFixed(0)}K hashes @ ${(hashrate / 1000).toFixed(0)}K/s`
      );
      setImmediate(batch);
    }

    batch();
  });
}

// ─── STEP 3 : POW FAUCET ────────────────────────────────────
function getFaucetETH(address) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚰 Connecting to pk910.de PoW faucet for ${address}...`);

    const ws = new WebSocket(FAUCET_WS, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; auto-deploy/1.0)' }
    });

    let sessionId      = null;
    let preimage       = null;
    let difficulty     = 20;
    let minClaim       = BigInt('10000000000000000'); // 0.01 ETH default
    let currentBalance = 0n;
    let mining         = false;
    let done           = false;

    const TIMEOUT = setTimeout(() => {
      if (!done) { ws.close(); reject(new Error('Faucet timeout (10 min)')); }
    }, 600_000);

    function finish(err, val) {
      if (done) return;
      done = true;
      mining = false;
      clearTimeout(TIMEOUT);
      try { ws.close(); } catch (_) {}
      err ? reject(err) : resolve(val);
    }

    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      ws.send(JSON.stringify({ action: 'getConfig' }));
    });

    ws.on('message', async raw => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.action) {

        case 'config':
          if (msg.minClaim) minClaim = BigInt(msg.minClaim);
          console.log(`📋 Min claim: ${ethers.formatEther(minClaim)} ETH`);
          ws.send(JSON.stringify({ action: 'startSession', addr: address }));
          break;

        case 'sessionInfo':
          sessionId  = msg.session;
          preimage   = msg.preimage;
          difficulty = msg.difficulty || 20;
          console.log(`🎯 Session: ${sessionId}`);
          console.log(`⛏️  Difficulty: ${difficulty} bits (~${(Math.pow(2, difficulty) / 1e6).toFixed(1)}M hashes/share)`);
          mining = true;
          submitLoop();
          break;

        case 'sessionUpdate':
          if (msg.balance !== undefined) {
            currentBalance = BigInt(msg.balance);
            process.stdout.write(
              `\r💰 Mined: ${ethers.formatEther(currentBalance)} / ${ethers.formatEther(minClaim)} ETH   `
            );
            if (currentBalance >= minClaim && !done) {
              process.stdout.write('\n');
              console.log('✅ Enough ETH mined! Claiming...');
              ws.send(JSON.stringify({ action: 'claimReward', session: sessionId }));
            }
          }
          break;

        case 'claimStatus':
          if (msg.txHash) {
            console.log(`\n✅ ETH claimed! TX: ${msg.txHash}`);
            console.log(`🔍 https://sepolia.etherscan.io/tx/${msg.txHash}`);
            finish(null, msg.txHash);
          }
          break;

        case 'error':
          console.error(`\n❌ Faucet [${msg.code}]: ${msg.message}`);
          if (['SESSION_LIMIT','INVALID_SESSION','CAPTCHA_REQUIRED','LIMIT_REACHED'].includes(msg.code)) {
            finish(new Error(`Faucet error: ${msg.message}`));
          }
          break;
      }
    });

    ws.on('error', err => finish(new Error(`WS error: ${err.message}`)));

    async function submitLoop() {
      while (mining && !done && currentBalance < minClaim) {
        try {
          const { nonce, hashrate } = await mineShare(preimage, difficulty);
          if (done) break;
          let nonceHex = nonce.toString(16);
          if (nonceHex.length % 2 !== 0) nonceHex = '0' + nonceHex;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              action:   'foundShare',
              session:  sessionId,
              nonce:    nonce,
              params:   preimage,
              hashrate: hashrate
            }));
            console.log(`📤 Share submitted (nonce: ${nonce}, hashrate: ${(hashrate/1000).toFixed(0)}K/s)`);
          }
          // Brief pause before next share
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.error('Mining error:', e.message);
          break;
        }
      }
    }
  });
}

// ─── STEP 4 : WAIT FOR ETH BALANCE ──────────────────────────
async function waitForBalance(provider, address, minBalance) {
  console.log(`\n⏳ Waiting for ETH on ${address}...`);
  for (let i = 0; i < 72; i++) {          // max 12 min
    const bal = await provider.getBalance(address);
    if (bal >= minBalance) {
      console.log(`✅ ETH received: ${ethers.formatEther(bal)} ETH`);
      return bal;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 10_000));
  }
  throw new Error('Timeout: no ETH received after 12 minutes');
}

// ─── STEP 5 : DEPLOY CONTRACT ────────────────────────────────
async function deployContract(wallet, abi, bytecode) {
  console.log('\n🚀 Deploying CustomUSDT to Sepolia...');
  const factory  = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy({ gasLimit: 3_000_000 });
  console.log(`📡 Deploy TX: ${contract.deploymentTransaction().hash}`);
  console.log('⏳ Waiting for confirmation...');
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ Contract deployed: ${address}`);
  console.log(`🔍 https://sepolia.etherscan.io/address/${address}`);
  return address;
}

// ─── STEP 6 : MINT USDT TO USER ─────────────────────────────
async function mintUSDT(wallet, contractAddress, abi, toAddress) {
  console.log(`\n💸 Minting 500,000,000 USDT → ${toAddress}...`);
  const contract = new ethers.Contract(contractAddress, abi, wallet);
  const amount   = ethers.parseUnits('500000000', 6);
  const tx       = await contract.mint(toAddress, amount, { gasLimit: 150_000 });
  console.log(`📡 Mint TX: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ 500,000,000 USDT minted!`);
  console.log(`🔍 https://sepolia.etherscan.io/tx/${tx.hash}`);
  return tx.hash;
}

// ─── STEP 7 : UPDATE CONFIG.JS ──────────────────────────────
function updateConfig(contractAddress) {
  const configPath = path.join(__dirname, 'js', 'config.js');
  let content = fs.readFileSync(configPath, 'utf8');
  content = content.replace(
    /USDT_CONTRACT_ADDRESS:\s*["'][^"']*["']/,
    `USDT_CONTRACT_ADDRESS: "${contractAddress}"`
  );
  fs.writeFileSync(configPath, content);
  console.log(`\n✅ js/config.js updated → USDT_CONTRACT_ADDRESS: "${contractAddress}"`);
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🚀  USDT Auto-Deploy  —  Sepolia Testnet  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n👤 Target wallet : ${USER_WALLET}`);
  console.log(`🌐 Network       : Sepolia Testnet`);

  // 1. Compile
  const { abi, bytecode } = compileContract();

  // 2. Use existing key (--key) or generate a new deployer wallet
  let deployer;
  if (KEY_ARG) {
    deployer = new ethers.Wallet(KEY_ARG);
    console.log(`\n🔑 Using existing deployer wallet:`);
    console.log(`   Address    : ${deployer.address}`);
  } else {
    deployer = ethers.Wallet.createRandom();
    console.log(`\n🔑 Deployer wallet generated:`);
    console.log(`   Address    : ${deployer.address}`);
    console.log(`   Private Key: ${deployer.privateKey}`);
    console.log(`   ⚠️  Save this key — needed if the script is interrupted!\n`);
  }

  // 3. Connect to working RPC
  console.log('\n🌐 Finding working Sepolia RPC...');
  const provider = await getWorkingProvider();

  // 4. Check if already funded (skip faucet if --key provided with balance)
  const existingBal = await provider.getBalance(deployer.address);
  if (existingBal >= MIN_ETH) {
    console.log(`✅ Wallet already funded: ${ethers.formatEther(existingBal)} ETH`);
  } else {
    // Try PoW faucet
    try {
      await getFaucetETH(deployer.address);
    } catch (e) {
      console.log(`\n⚠️  Auto-faucet failed: ${e.message}`);
      console.log('\n📋 MANUAL STEP — fund the deployer wallet:');
      console.log(`   1. Open: https://sepolia-faucet.pk910.de`);
      console.log(`   2. Enter address: ${deployer.address}`);
      console.log(`   3. Wait for mining to complete (~2-3 min)`);
      console.log(`   4. Press ENTER here when done...`);
      await new Promise(r => {
        process.stdin.setEncoding('utf8');
        process.stdin.resume();
        process.stdin.once('data', r);
      });
    }
    // Wait for ETH balance
    await waitForBalance(provider, deployer.address, MIN_ETH);
  }

  // 5. Deploy contract
  const wallet          = deployer.connect(provider);
  const contractAddress = await deployContract(wallet, abi, bytecode);

  // 6. Mint 500M USDT to user wallet
  await mintUSDT(wallet, contractAddress, abi, USER_WALLET);

  // 7. Update config.js
  updateConfig(contractAddress);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   ✅  DEPLOYMENT COMPLETE!                   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n📋 Contract : ${contractAddress}`);
  console.log(`💰 Balance  : 500,000,000 USDT → ${USER_WALLET}`);
  console.log(`\n🎯 Next steps:`);
  console.log(`   1. Reload http://localhost:3000`);
  console.log(`   2. Connect MetaMask (Sepolia network)`);
  console.log(`   3. Click "🦊 Add to MetaMask" → USDT appears in wallet`);
  console.log(`   4. Send USDT to any address — visible on sepolia.etherscan.io ✅\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
