const crypto = require('crypto');
const { TronWeb } = require('tronweb');

// Master BTC address for receiving payments
const MASTER_BTC_ADDRESS = 'bc1qgenfze5dv789afpy8x3grnpatnh7afg2twqftt';

// BTC amounts per plan (USD)
const PLAN_PRICES = {
  '10k':  100,
  '500k': 500,
  '1m':   1000,
};

// USDT amounts per plan
const PLAN_USDT = {
  '10k':  10000,
  '500k': 500000,
  '1m':   1000000,
};

/**
 * Generate a deterministic unique sub-identifier for each user
 * In production you'd use HD wallet derivation; for simulation we
 * embed the user ID as a memo/label and use the master address.
 */
function generateBtcAddressForUser(userId) {
  // We use the master address for all users (simulation mode).
  // The unique identifier is tracked via userId in MongoDB.
  return MASTER_BTC_ADDRESS;
}

/**
 * Generate a unique payment reference code shown to user
 */
function generatePaymentRef(userId) {
  const hash = crypto.createHash('sha256').update(userId.toString()).digest('hex');
  return hash.slice(0, 12).toUpperCase();
}

/**
 * Generate a TRON address with retry logic
 * Returns: { success: boolean, address: string, error?: string }
 */
async function generateTronAddress() {
  try {
    console.log(`[TRON] Generating address...`);
    const { TronWeb } = require('tronweb');

    // Generate random private key (hex format without 0x prefix)
    const privateKey = crypto.randomBytes(32).toString('hex');
    console.log(`[TRON] Generated private key`);

    // Create TronWeb and get address from private key
    const tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      privateKey: privateKey
    });

    const address = tronWeb.address.fromPrivateKey(privateKey);
    console.log(`[TRON] ✓ Generated address: ${address}`);

    if (address && address.startsWith('T')) {
      return { success: true, address };
    }

    throw new Error(`Invalid TRON address: ${address}`);
  } catch (e) {
    console.error(`[TRON] Generation failed:`, e.message);
    return {
      success: false,
      address: '',
      error: `Failed to generate TRON address: ${e.message}`
    };
  }
}

module.exports = {
  generateBtcAddressForUser,
  generatePaymentRef,
  generateTronAddress,
  PLAN_PRICES,
  PLAN_USDT,
  MASTER_BTC_ADDRESS,
};
