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
 * Generate a TRON account (address + private key)
 * Returns: { success: boolean, address: string, privateKey: string, error?: string }
 */
async function generateTronAccount() {
  try {
    console.log(`[TRON] Generating new account...`);
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
    console.log(`[TRON] ✓ Generated account: ${address}`);

    if (address && address.startsWith('T')) {
      return { success: true, address, privateKey };
    }

    throw new Error(`Invalid TRON address: ${address}`);
  } catch (e) {
    console.error(`[TRON] Generation failed:`, e.message);
    return {
      success: false,
      address: '',
      privateKey: '',
      error: `Failed to generate TRON account: ${e.message}`
    };
  }
}

/**
 * Encrypt a private key for storage
 */
function encryptPrivateKey(privateKey, encryptionKey = process.env.ENCRYPTION_KEY || 'default-key') {
  if (!privateKey) return '';
  try {
    const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  } catch (e) {
    console.error('[ENCRYPT] Error:', e.message);
    return '';
  }
}

/**
 * Decrypt a stored private key
 */
function decryptPrivateKey(encrypted, encryptionKey = process.env.ENCRYPTION_KEY || 'default-key') {
  if (!encrypted) return '';
  try {
    const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('[DECRYPT] Error:', e.message);
    return '';
  }
}

/**
 * Send USDT via TronWeb (real blockchain transfer)
 */
async function sendUsdtTrc20(fromPrivateKey, toAddress, amount) {
  try {
    console.log(`[USDT-SEND] Sending ${amount} USDT to ${toAddress}`);
    const { TronWeb } = require('tronweb');

    const tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      privateKey: fromPrivateKey
    });

    const contract = await tronWeb.contract(USDT_ABI, USDT_CONTRACT_ADDRESS);
    const amountToSend = amount * Math.pow(10, 6); // USDT uses 6 decimals

    const tx = await contract.transfer(toAddress, amountToSend).send({
      feeLimit: 100_000_000
    });

    console.log(`[USDT-SEND] ✓ Transaction sent: ${tx}`);
    return { success: true, txHash: tx };
  } catch (e) {
    console.error(`[USDT-SEND] Failed:`, e.message);
    return { success: false, error: e.message };
  }
}

// USDT Contract ABI (minimal)
const USDT_ABI = [
  {
    "constant": false,
    "inputs": [
      { "name": "_to", "type": "address" },
      { "name": "_value", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "name": "", "type": "bool" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  }
];

const USDT_CONTRACT_ADDRESS = process.env.USDT_TRC20_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT on TRON Mainnet

module.exports = {
  generateBtcAddressForUser,
  generatePaymentRef,
  generateTronAddress: generateTronAccount, // Keep old name for compatibility
  generateTronAccount,
  encryptPrivateKey,
  decryptPrivateKey,
  sendUsdtTrc20,
  PLAN_PRICES,
  PLAN_USDT,
  MASTER_BTC_ADDRESS,
  USDT_ABI,
  USDT_CONTRACT_ADDRESS,
};
