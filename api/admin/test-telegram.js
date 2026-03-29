const jwt = require('jsonwebtoken');
const { notifyNewRegistration, sendTrackingEvent } = require('../_lib/telegram');

const ALLOWED_EMAIL = 'reussite522@gmail.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim() || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token provided.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  if (!decoded.email || String(decoded.email).toLowerCase() !== ALLOWED_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const now = Date.now();
  const suffix = String(now).slice(-6);
  const fakeEmail = `test.user.${suffix}@example.com`;
  const fakeWallet = `TTESTWALLET${suffix}`;
  const fakeIp = '102.88.10.25';
  const fakeCity = 'Lagos, NG';

  try {
    await notifyNewRegistration({
      _id: `test_${suffix}`,
      email: fakeEmail,
      accountType: '10k',
      btcAddress: 'bc1qtesttelegram8j2v7fh6k5h3s9m2xv0qz4l0w6r9p',
      paymentRef: `PAY-TEST-${suffix}`,
      tronAddress: fakeWallet,
      registrationIp: fakeIp,
      registrationCity: 'Lagos',
      registrationCountry: 'NG',
      registrationLocation: fakeCity,
    });

    await sendTrackingEvent({
      eventType: 'auth_action',
      page: '/register.html',
      action: 'telegram_test_event',
      details: 'Manual Telegram test notification',
      userId: 'admin-test',
      email: fakeEmail,
      wallet: fakeWallet,
      sessionId: `sess_test_${suffix}`,
      ip: fakeIp,
      city: 'Lagos',
      country: 'NG',
      location: fakeCity,
      userAgent: 'Telegram-Test-Agent/1.0',
    });

    return res.status(200).json({
      ok: true,
      sent: 2,
      sample: {
        email: fakeEmail,
        wallet: fakeWallet,
        ip: fakeIp,
        city: fakeCity,
      },
    });
  } catch (err) {
    console.error('test telegram error:', err);
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'Internal server error',
    });
  }
};
