const jwt = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Token requis.' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token invalide.' });
    }

    await connectDB();
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const { firstName, lastName } = req.body || {};

    // Allow empty strings to clear the fields
    if (firstName !== undefined) {
      user.firstName = String(firstName).trim().slice(0, 50);
    }
    if (lastName !== undefined) {
      user.lastName = String(lastName).trim().slice(0, 50);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      firstName: user.firstName,
      lastName: user.lastName,
    });

  } catch (err) {
    console.error('update-profile error', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
