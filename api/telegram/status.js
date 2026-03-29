const { getWebhookInfo } = require('../_lib/telegram');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const info = await getWebhookInfo();

    return res.status(200).json({
      ok: true,
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chatConfigured: Boolean(process.env.TELEGRAM_CHAT_ID),
      adminChatConfigured: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
      adminUserConfigured: Boolean(process.env.TELEGRAM_ADMIN_USERNAME),
      webhook: {
        url: info && info.url ? info.url : '',
        hasCustomCertificate: Boolean(info && info.has_custom_certificate),
        pendingUpdateCount: Number((info && info.pending_update_count) || 0),
        lastErrorDate: info && info.last_error_date ? info.last_error_date : null,
        lastErrorMessage: info && info.last_error_message ? info.last_error_message : '',
      },
    });
  } catch (err) {
    console.error('telegram status error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
};
