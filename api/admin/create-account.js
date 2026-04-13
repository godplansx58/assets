const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');
const { generateBtcAddressForUser, generatePaymentRef, PLAN_PRICES, PLAN_USDT } = require('../_lib/btcAddress');

const ADMIN_EMAIL = 'reussite522@gmail.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) return res.status(401).json({ error: 'No token provided.' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    await connectDB();
    const admin = await User.findById(decoded.userId);
    if (!admin) return res.status(404).json({ error: 'Admin user not found.' });

    // Vérifier que c'est l'admin
    if (admin.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Only admin can create accounts.' });
    }

    const { email, password, accountType, tronAddress } = req.body || {};

    // Validation
    if (!email || !password || !accountType) {
      return res.status(400).json({ error: 'Email, password and account type are required.' });
    }

    if (!['10k', '500k', '1m'].includes(accountType)) {
      return res.status(400).json({ error: 'Invalid account type.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    // Vérifier duplicate
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Créer l'utilisateur
    const user = new User({
      email:       email.toLowerCase(),
      password:    hashedPassword,
      accountType,
      tronAddress: tronAddress || '',
      btcAddress:  'pending',
      btcAmount:   PLAN_PRICES[accountType],
      status:      'approved', // Admin-created accounts are immediately approved
      approvedAt:  new Date(),
    });
    await user.save();

    // Generate BTC address
    const btcAddress  = generateBtcAddressForUser(user._id);
    const paymentRef  = generatePaymentRef(user._id);
    user.btcAddress   = btcAddress;
    await user.save();

    return res.status(201).json({
      ok: true,
      user: {
        _id:         user._id,
        email:       user.email,
        accountType: user.accountType,
        status:      user.status,
        btcAddress,
        btcAmount:   PLAN_PRICES[accountType],
        paymentRef,
        tronAddress: user.tronAddress,
        usdtAmount:  PLAN_USDT[accountType],
        createdAt:   user.createdAt,
      },
    });

  } catch (err) {
    console.error('create-account error', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
