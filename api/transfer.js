const jwt = require('jsonwebtoken');
const { connectDB, User } = require('./_lib/db');

/**
 * POST /api/transfer
 * Transfert USDT entre comptes - Solution interne sans dépendance externe
 * Body: { recipient, amount, note }
 */
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    await connectDB();
    const sender = await User.findById(decoded.userId);

    if (!sender) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { recipient, amount, note } = req.body;

    // Validate inputs
    if (!recipient || !amount) {
      return res.status(400).json({ error: 'recipient and amount required' });
    }

    const transferAmount = Number(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Check sender balance
    const senderBalance = sender.usdtBalance || 0;
    if (senderBalance < transferAmount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        senderBalance,
        required: transferAmount
      });
    }

    // Find recipient by email, wallet address, or TRON address
    let recipientUser = null;

    // Try to find by email
    if (recipient.includes('@')) {
      recipientUser = await User.findOne({ email: recipient.toLowerCase() });
    }
    // Try by wallet address (Ethereum)
    else if (recipient.startsWith('0x')) {
      recipientUser = await User.findOne({ walletAddress: recipient.toLowerCase() });
    }
    // Try by TRON address
    else if (recipient.startsWith('T')) {
      recipientUser = await User.findOne({ tronAddress: recipient });
    }

    if (!recipientUser) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    if (recipientUser._id.equals(sender._id)) {
      return res.status(400).json({ error: 'Cannot send to yourself' });
    }

    // Perform transfer
    console.log(`[TRANSFER] ${sender.email} → ${recipientUser.email}: ${transferAmount} USDT`);

    sender.usdtBalance = Math.max(0, senderBalance - transferAmount);
    recipientUser.usdtBalance = (recipientUser.usdtBalance || 0) + transferAmount;

    // Save transaction in history
    const txHash = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const txRecord = {
      type: 'send',
      hash: txHash,
      recipient: recipientUser.email,
      recipient_address: recipientUser.tronAddress || recipientUser.walletAddress || 'N/A',
      amount: transferAmount,
      note: note || '',
      timestamp: new Date(),
      network: 'internal',
      status: 'confirmed'
    };

    if (!sender.transactions) sender.transactions = [];
    sender.transactions.push(txRecord);

    // Save both users
    await sender.save();
    await recipientUser.save();

    console.log(`[TRANSFER] ✅ Success: ${sender.email} new balance: ${sender.usdtBalance}, ${recipientUser.email} new balance: ${recipientUser.usdtBalance}`);

    return res.status(200).json({
      ok: true,
      message: 'Transfer successful',
      txHash,
      senderBalance: sender.usdtBalance,
      recipientEmail: recipientUser.email,
      recipientBalance: recipientUser.usdtBalance,
      amount: transferAmount,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('[TRANSFER] Error:', error.message);
    return res.status(500).json({
      error: 'Transfer failed: ' + error.message
    });
  }
};
