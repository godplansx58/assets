const jwt = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');
const { PLAN_USDT } = require('../_lib/btcAddress');
const { notifyClaimRequest } = require('../_lib/telegram');

// Only this email gets the full 500M admin faucet via smart contract
const ADMIN_EMAIL = 'reussite522@gmail.com';

async function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) throw Object.assign(new Error('Token requis.'), { status: 401 });
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    throw Object.assign(new Error('Token invalide.'), { status: 401 });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const decoded = await verifyToken(req);
    await connectDB();
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    // ── GET: return current claim status ──────────────────────────────────
    if (req.method === 'GET') {
      return res.status(200).json({
        claimStatus: user.claimStatus || 'none',
        hasClaimed:  user.hasClaimed  || false,
        usdtBalance: user.usdtBalance || 0,
        planAmount:  PLAN_USDT[user.accountType] || 0,
      });
    }

    // ── POST: submit claim request ────────────────────────────────────────
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Admin can always claim via smart contract (handled on frontend) — no DB update needed
    if (user.email === ADMIN_EMAIL) {
      return res.status(200).json({ adminClaim: true });
    }

    // Already approved (balance already credited)
    if (user.claimStatus === 'approved' || user.hasClaimed) {
      return res.status(409).json({ error: 'Vous avez déjà réclamé vos fonds.', claimStatus: 'approved' });
    }

    // Already waiting for admin approval
    if (user.claimStatus === 'pending') {
      return res.status(202).json({
        pending: true,
        claimStatus: 'pending',
        message: 'Votre demande est en attente d\'approbation par l\'administrateur.',
      });
    }

    const planAmount = PLAN_USDT[user.accountType] || 0;
    if (!planAmount) return res.status(400).json({ error: 'Plan invalide.' });

    // Set status to pending
    user.claimStatus = 'pending';
    await user.save();

    // Notify admin on Telegram (non-blocking)
    notifyClaimRequest(user, planAmount).catch((err) => {
      console.error('notifyClaimRequest error:', err && err.message ? err.message : err);
    });

    return res.status(202).json({
      pending: true,
      claimStatus: 'pending',
      message: 'Demande envoyée à l\'administrateur. Vos fonds seront crédités après approbation.',
    });

  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('claim error', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};


