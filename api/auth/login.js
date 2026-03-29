const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');
const { PLAN_PRICES, PLAN_USDT, generatePaymentRef } = require('../_lib/btcAddress');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await connectDB();

    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign(
      { userId: user._id, email: user.email, status: user.status },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      token,
      user: {
        email:       user.email,
        accountType: user.accountType,
        status:      user.status,
        btcAddress:  user.btcAddress,
        btcAmount:   PLAN_PRICES[user.accountType],
        btcPaid:     user.btcPaid,
        paymentRef:  generatePaymentRef(user._id),
        tronAddress: user.tronAddress,
        usdtBalance: user.usdtBalance || 0,
        usdtSentTx:  user.usdtSentTx,
        hasClaimed:  user.hasClaimed  || false,
        claimStatus: user.claimStatus || 'none',
        firstName:   user.firstName   || '',
        lastName:    user.lastName    || '',
      },
    });

  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
