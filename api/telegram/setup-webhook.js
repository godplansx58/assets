const { setWebhook, getWebhookInfo } = require('../_lib/telegram');

function buildBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  if (!host) return '';
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const setupKey = String(process.env.TELEGRAM_SETUP_KEY || '').trim();
  const providedKey = String(req.headers['x-setup-key'] || req.query.key || '').trim();

  if (!setupKey || providedKey !== setupKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body || {};
    const explicitUrl = body.webhookUrl || req.query.webhookUrl || '';
    const baseUrl = buildBaseUrl(req);
    const webhookUrl = explicitUrl || (baseUrl ? `${baseUrl}/api/telegram/webhook` : '');

    if (!webhookUrl) {
      return res.status(400).json({ error: 'Cannot resolve webhook URL' });
    }

    const ok = await setWebhook(webhookUrl);
    const info = await getWebhookInfo();

    return res.status(200).json({
      ok: Boolean(ok),
      webhookUrl,
      pendingUpdateCount: Number((info && info.pending_update_count) || 0),
      lastErrorMessage: info && info.last_error_message ? info.last_error_message : '',
    });
  } catch (err) {
    console.error('setup webhook error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
};
