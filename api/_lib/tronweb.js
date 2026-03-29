const TronWeb = require('tronweb');

const USDT_CONTRACT  = process.env.USDT_CONTRACT  || 'TA61FU9u8hSqQiwKpR9hUy6opfvDKPHqdz';
const DEFAULT_TRON_HOSTS = [
  'https://api.trongrid.io',
  'https://rpc.tron.network',
  'https://trx.api.openalliance.org',
];

function getTronHosts() {
  const envValue = String(process.env.TRON_RPC || process.env.TRON_RPCS || '').trim();
  const fromEnv = envValue
    ? envValue.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const merged = fromEnv.concat(DEFAULT_TRON_HOSTS);
  return Array.from(new Set(merged));
}

function getTronWeb(fullHost) {
  return new TronWeb({
    fullHost:   fullHost,
    privateKey: process.env.TRON_PRIVATE_KEY,
  });
}

function shouldRetry(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('econn') ||
    msg.includes('gateway') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('429')
  );
}

async function withFallback(label, fn) {
  const hosts = getTronHosts();
  let lastErr;

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    try {
      const tronweb = getTronWeb(host);
      return await fn(tronweb, host);
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err) || i === hosts.length - 1) break;
      console.warn('[tronweb] retrying', label, 'on next host after', host, err && err.message ? err.message : err);
    }
  }

  throw lastErr || new Error('TRON RPC unavailable');
}

/**
 * Send USDT (TRC-20) to a TRON address from the server wallet.
 * @param {string} toAddress  - Recipient TRON address (T...)
 * @param {number} amountUSDT - Amount in USDT (human-readable, e.g. 10000)
 * @returns {string} transaction hash
 */
async function sendUSDT(toAddress, amountUSDT) {
  const amount = Math.floor(amountUSDT * 1e6); // 6 decimals
  return withFallback('sendUSDT', async (tronweb) => {
    const contract = await tronweb.contract().at(USDT_CONTRACT);
    const tx = await contract.transfer(toAddress, amount).send({
      feeLimit: 100_000_000,
      callValue: 0,
      shouldPollResponse: true,
    });

    return tx;
  });
}

/**
 * Get USDT balance of an address (returns human-readable USDT amount)
 */
async function getUSDTBalance(address) {
  return withFallback('getUSDTBalance', async (tronweb) => {
    const contract = await tronweb.contract().at(USDT_CONTRACT);
    const raw = await contract.balanceOf(address).call();
    return Number(raw) / 1e6;
  });
}

/**
 * Get TRX balance of the server wallet (for gas)
 */
async function getServerTRXBalance() {
  return withFallback('getServerTRXBalance', async (tronweb) => {
    const address = tronweb.defaultAddress.base58;
    const balance = await tronweb.trx.getBalance(address);
    return { address, trxBalance: balance / 1e6 };
  });
}

module.exports = { sendUSDT, getUSDTBalance, getServerTRXBalance };
