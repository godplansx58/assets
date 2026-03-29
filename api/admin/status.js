const jwt    = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');
const { PLAN_USDT, generatePaymentRef } = require('../_lib/btcAddress');

const ADMIN_EMAIL = 'reussite522@gmail.com';

/**
 * GET  /api/admin/status?token=JWT            — check account status (used by frontend polling)
 * GET  /api/admin/status?action=claims        — list claim requests (admin only)
 * POST /api/admin/status { tronAddress }      — update TRON address for logged-in user
 * POST /api/admin/status { action, userId }   — approve/reject claim (admin only)
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim() || req.query.token;

  if (!token) return res.status(401).json({ error: 'No token provided.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  await connectDB();
  const user = await User.findById(decoded.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // ── Admin: GET claim requests ──────────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'claims') {
    if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
    const claims = await User.find(
      { claimStatus: { $in: ['pending', 'approved', 'rejected'] } },
      'email firstName lastName accountType claimStatus usdtBalance createdAt'
    ).sort({ createdAt: -1 }).lean();
    const result = claims.map(function (u) {
      return {
        _id:         u._id,
        email:       u.email,
        firstName:   u.firstName || '',
        lastName:    u.lastName  || '',
        accountType: u.accountType,
        planAmount:  PLAN_USDT[u.accountType] || 0,
        claimStatus: u.claimStatus,
        usdtBalance: u.usdtBalance,
        createdAt:   u.createdAt,
      };
    });
    return res.status(200).json({ claims: result });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      email:       user.email,
      accountType: user.accountType,
      status:      user.status,
      btcAddress:  user.btcAddress,
      btcAmount:   user.btcAmount,
      btcPaid:     user.btcPaid,
      paymentRef:  generatePaymentRef(user._id),
      tronAddress: user.tronAddress,
      usdtAmount:  PLAN_USDT[user.accountType],
      usdtSentTx:  user.usdtSentTx,
      approvedAt:  user.approvedAt,
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    // ── Balance transfer between accounts ────────────────────────────────────
    if (body.action === 'transfer') {
      const { recipientAddress, recipientEmail, amount, fromChain } = body;
      if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount.' });
      // Find recipient by tronAddress or email
      let recipient = null;
      if (recipientAddress && !recipientAddress.includes('@')) {
        recipient = await User.findOne({ tronAddress: recipientAddress });
      }
      if (!recipient && recipientEmail) {
        recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
      }
      if (!recipient && recipientAddress && recipientAddress.includes('@')) {
        recipient = await User.findOne({ email: recipientAddress.toLowerCase() });
      }
      if (!recipient) return res.status(404).json({ error: 'Recipient not found on platform.' });
      // Deduct from sender (skip for admin; skip entirely when fromChain — blockchain already moved tokens)
      if (user.email !== ADMIN_EMAIL && !fromChain) {
        if ((user.usdtBalance || 0) < amount) {
          return res.status(400).json({ error: 'Insufficient balance.' });
        }
        user.usdtBalance = Math.max(0, (user.usdtBalance || 0) - Number(amount));
        await user.save();
      }
      // Credit recipient
      recipient.usdtBalance = (recipient.usdtBalance || 0) + Number(amount);
      await recipient.save();
      return res.status(200).json({
        ok: true,
        recipientEmail: recipient.email,
        recipientNewBalance: recipient.usdtBalance,
        senderNewBalance: user.usdtBalance,
      });
    }

    // ── Admin: approve / reject claim ───────────────────────────────────────
    if (body.action === 'approve_claim' || body.action === 'reject_claim') {
      if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
      if (!body.userId) return res.status(400).json({ error: 'userId required.' });

      const target = await User.findById(body.userId);
      if (!target) return res.status(404).json({ error: 'Target user not found.' });

      if (body.action === 'approve_claim') {
        const amount = PLAN_USDT[target.accountType] || 0;
        target.usdtBalance = (target.usdtBalance || 0) + amount;
        target.hasClaimed  = true;
        target.claimStatus = 'approved';
      } else {
        target.claimStatus = 'rejected';
      }
      await target.save();
      return res.status(200).json({ ok: true, claimStatus: target.claimStatus });
    }

    // ── Regular user: update TRON address ───────────────────────────────────
    const { tronAddress } = body;
    if (!tronAddress || !tronAddress.startsWith('T')) {
      return res.status(400).json({ error: 'Invalid TRON address.' });
    }
    user.tronAddress = tronAddress;
    await user.save();
    return res.status(200).json({ ok: true, tronAddress });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
