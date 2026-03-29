module.exports = async function handler(req, res) {
  res.json({
    ok: true,
    hasMongoUri: !!process.env.MONGODB_URI,
    hasJwt: !!process.env.JWT_SECRET,
    hasTelegram: !!process.env.TELEGRAM_BOT_TOKEN,
    nodeVersion: process.version,
  });
};
