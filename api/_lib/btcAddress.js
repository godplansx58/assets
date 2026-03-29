const crypto = require('crypto');

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

module.exports = {
  generateBtcAddressForUser,
  generatePaymentRef,
  PLAN_PRICES,
  PLAN_USDT,
  MASTER_BTC_ADDRESS,
};
