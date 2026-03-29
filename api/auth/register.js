const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');
const { generateBtcAddressForUser, generatePaymentRef, PLAN_PRICES, PLAN_USDT } = require('../_lib/btcAddress');
const { notifyNewRegistration } = require('../_lib/telegram');
const { getClientIp, getClientGeo } = require('../_lib/requestMeta');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await connectDB();

    const { email, password, accountType, tronAddress } = req.body || {};

    // Validate inputs
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

    // Check duplicate
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user (save first to get _id)
    const user = new User({
      email:       email.toLowerCase(),
      password:    hashedPassword,
      accountType,
      tronAddress: tronAddress || '',
      btcAddress:  'pending',   // will be updated after save
      btcAmount:   PLAN_PRICES[accountType],
    });
    await user.save();

    // Generate BTC address + payment ref using user _id
    const btcAddress  = generateBtcAddressForUser(user._id);
    const paymentRef  = generatePaymentRef(user._id);
    user.btcAddress   = btcAddress;
    await user.save();

    // Notify admin on Telegram (non-blocking)
    const registrationIp = getClientIp(req);
    const geo = getClientGeo(req);
    notifyNewRegistration({
      ...user.toObject(),
      paymentRef,
      registrationIp,
      registrationCity: geo.city,
      registrationCountry: geo.country,
      registrationLocation: geo.location,
    }).catch((err) => {
      console.error('notifyNewRegistration error', err && err.message ? err.message : err);
    });

    // Return JWT so user is logged in immediately (status: pending)
    const token = jwt.sign(
      { userId: user._id, email: user.email, status: user.status },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: {
        email:       user.email,
        accountType: user.accountType,
        status:      user.status,
        btcAddress,
        btcAmount:   PLAN_PRICES[accountType],
        paymentRef,
        tronAddress: user.tronAddress,
        usdtAmount:  PLAN_USDT[accountType],
      },
    });

  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
