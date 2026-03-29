const { connectDB, TelemetryEvent } = require('../_lib/db');
const { queueTrackingEvent } = require('../_lib/trackingAggregator');
const { getClientIp, getClientGeo } = require('../_lib/requestMeta');

function safeText(v, maxLen) {
  const text = String(v || '');
  return text.slice(0, maxLen);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const eventType = safeText(body.eventType || 'unknown', 40);
    const page = safeText(body.page || '/', 160);
    const action = safeText(body.action || '', 120);
    const details = safeText(body.details || '', 400);
    const sessionId = safeText(body.sessionId || 'anonymous', 80);
    const userId = safeText(body.userId || 'guest', 120);
    const email = safeText(body.email || '', 160);
    const wallet = safeText(body.wallet || body.tronAddress || '', 160);
    const userAgent = safeText(req.headers['user-agent'] || 'unknown', 280);
    const ip = getClientIp(req);
    const geo = getClientGeo(req);
    const ts = new Date();

    await connectDB();
    await TelemetryEvent.create({
      eventType,
      page,
      action,
      details,
      sessionId,
      userId,
      email,
      wallet,
      userAgent,
      ip,
      city: geo.city,
      country: geo.country,
      location: geo.location,
      ts,
    });

    await queueTrackingEvent({
      eventType,
      page,
      action,
      details,
      sessionId,
      userId,
      email,
      wallet,
      userAgent,
      ip,
      city: geo.city,
      country: geo.country,
      location: geo.location,
      ts,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('tracking webhook error', err);
    return res.status(200).json({ ok: false });
  }
};