const jwt = require('jsonwebtoken');
const { connectDB, TelemetryEvent } = require('../_lib/db');

const ALLOWED_EMAIL = 'reussite522@gmail.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

  await connectDB();

  const since = new Date(Date.now() - 15 * 60 * 1000);
  const [events, activeSessions, topActions] = await Promise.all([
    TelemetryEvent.find({ ts: { $gte: since } })
      .sort({ ts: -1 })
      .limit(60)
      .lean(),
    TelemetryEvent.distinct('sessionId', { ts: { $gte: since } }),
    TelemetryEvent.aggregate([
      { $match: { ts: { $gte: since } } },
      {
        $group: {
          _id: { eventType: '$eventType', action: '$action', page: '$page' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
  ]);

  return res.status(200).json({
    allowed: true,
    stats: {
      eventsLast15m: events.length,
      activeSessions: activeSessions.length,
      uniquePages: new Set(events.map((e) => e.page)).size,
    },
    topActions,
    events,
  });
};
