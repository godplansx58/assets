const { connectDB, User, TelemetryEvent } = require('./db');
const { sendPlainMessage } = require('./telegram');
const { flushNow, getQueueStats } = require('./trackingAggregator');

const ADMIN_CHAT_ID = String(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '').trim();
const ADMIN_USERNAME = String(process.env.TELEGRAM_ADMIN_USERNAME || '').trim().replace('@', '').toLowerCase();

function isAdmin(msg) {
  const chatId = msg && msg.chat && msg.chat.id;
  const username = String((msg && msg.from && msg.from.username) || '').toLowerCase();
  const byChat = ADMIN_CHAT_ID && String(chatId) === ADMIN_CHAT_ID;
  const byUser = ADMIN_USERNAME && username === ADMIN_USERNAME;
  return Boolean(byChat || byUser);
}

function commandFromText(text) {
  if (!text || typeof text !== 'string') return '';
  const token = text.trim().split(/\s+/)[0] || '';
  if (!token.startsWith('/')) return '';
  return token.split('@')[0].toLowerCase();
}

async function adminStatusText() {
  await connectDB();

  const [pending, approved, rejected, usersTotal, telemetry15m] = await Promise.all([
    User.countDocuments({ status: 'pending' }),
    User.countDocuments({ status: 'approved' }),
    User.countDocuments({ status: 'rejected' }),
    User.countDocuments({}),
    TelemetryEvent.countDocuments({ ts: { $gte: new Date(Date.now() - 15 * 60 * 1000) } }),
  ]);

  const q = getQueueStats();
  const flushState = q.hasTimer ? 'Scheduled' : 'Idle';

  return [
    'USDT Sender Admin Dashboard',
    '--------------------------------',
    'System: Online',
    '',
    'Users',
    `- Total: ${usersTotal}`,
    `- Pending: ${pending}`,
    `- Approved: ${approved}`,
    `- Rejected: ${rejected}`,
    '',
    'Telemetry',
    `- Events (15m): ${telemetry15m}`,
    `- Queue: ${q.queueLength}`,
    `- Flush: ${flushState}`,
  ].join('\n');
}

async function handleCommand(update) {
  const msg = update && update.message;
  if (!msg || !msg.text) return false;

  const command = commandFromText(msg.text);
  if (!command) return false;

  const chatId = msg.chat && msg.chat.id;
  const admin = isAdmin(msg);

  if (command === '/start' || command === '/help') {
    const greeting = [
      'Welcome to USDT Sender Bot',
      'Your control center is now active.',
      '',
      'Available commands',
      '/start  - Open this menu',
      '/help   - Show command guide',
      '/ping   - Quick health check',
      '/status - Admin live metrics',
      '/flush  - Force telemetry summary now',
      '',
      'Tip: /status and /flush are admin-only commands.',
    ].join('\n');

    await sendPlainMessage(chatId, greeting);
    return true;
  }

  if (command === '/ping') {
    await sendPlainMessage(chatId, 'Pong. Bot is online and ready.');
    return true;
  }

  if (!admin) {
    await sendPlainMessage(chatId, 'Access denied for admin commands. Use /help for public commands.');
    return true;
  }

  if (command === '/status') {
    const status = await adminStatusText();
    await sendPlainMessage(chatId, status);
    return true;
  }

  if (command === '/flush') {
    await flushNow();
    await sendPlainMessage(chatId, 'Done. Telemetry queue flushed and summary dispatched.');
    return true;
  }

  await sendPlainMessage(chatId, 'Unknown command. Open /help to see the command guide.');
  return true;
}

module.exports = {
  handleCommand,
};
