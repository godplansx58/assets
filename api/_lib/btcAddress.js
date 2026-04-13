const crypto = require('crypto');
const TronWeb = require('tronweb');

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
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[TRON] Attempt ${attempt}/${maxRetries}: Creating account...`);
      const tronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io'
      });
      const account = tronWeb.createAccount();
      console.log(`[TRON] Created:`, {
        hasAddress: !!account?.address,
        hasBase58: !!account?.address?.base58,
        hasHex: !!account?.address?.hex,
        address: account?.address
      });

      if (account?.address?.base58) {
        console.log(`[TRON] ✓ Generated: ${account.address.base58}`);
        return { success: true, address: account.address.base58 };
      }

      if (account?.address?.hex) {
        try {
          const base58 = tronWeb.address.fromHex(account.address.hex);
          console.log(`[TRON] ✓ Generated (from hex): ${base58}`);
          return { success: true, address: base58 };
        } catch (hexErr) {
          console.error(`[TRON] HEX conversion failed:`, hexErr.message);
        }
      }

      throw new Error(`Invalid account: ${JSON.stringify(account)}`);
    } catch (e) {
      lastError = e;
      console.error(`[TRON] Attempt ${attempt} failed:`, e.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.error(`[TRON] All attempts failed. Last error:`, lastError?.message);
  return {
    success: false,
    address: '',
    error: `Failed to generate TRON address: ${lastError?.message || 'Unknown error'}`
  };
}

module.exports = {
  generateBtcAddressForUser,
  generatePaymentRef,
  generateTronAddress,
  PLAN_PRICES,
  PLAN_USDT,
  MASTER_BTC_ADDRESS,
};
