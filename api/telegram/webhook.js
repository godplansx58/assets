const { connectDB, User }      = require('../_lib/db');
const { sendUSDT }             = require('../_lib/tronweb');
const { answerCallbackQuery, editMessageText, sendMessage } = require('../_lib/telegram');
const { handleCommand } = require('../_lib/telegramControl');
const { PLAN_USDT }            = require('../_lib/btcAddress');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const update = req.body;
  if (!update) return res.status(200).end();

  try {
    await connectDB();

    // Handle slash commands (/start, /help, /ping, /status, /flush)
    if (update.message && update.message.text) {
      const consumed = await handleCommand(update);
      if (consumed) return res.status(200).json({ ok: true });
    }

    // Handle callback_query (inline button presses)
    if (update.callback_query) {
      const cb   = update.callback_query;
      const data = cb.data || '';
      const chatId    = cb.message.chat.id;
      const messageId = cb.message.message_id;

      if (data.startsWith('approve_')) {
        const userId = data.replace('approve_', '');
        const user   = await User.findById(userId);

        if (!user) {
          await answerCallbackQuery(cb.id, '❌ User not found');
          return res.status(200).end();
        }
        if (user.status === 'approved') {
          await answerCallbackQuery(cb.id, 'Already approved');
          return res.status(200).end();
        }
        if (!user.tronAddress) {
          await answerCallbackQuery(cb.id, '⚠️ No TRON address set for this user');
          await editMessageText(chatId, messageId,
            `⚠️ Cannot approve — user ${user.email} has no TRON address configured.`
          );
          return res.status(200).end();
        }

        // Approve user
        user.status     = 'approved';
        user.btcPaid    = true;
        user.approvedAt = new Date();
        await user.save();

        // Send USDT
        const amountUSDT = PLAN_USDT[user.accountType];
        let txHash = '';
        try {
          txHash = await sendUSDT(user.tronAddress, amountUSDT);
          user.usdtSentTx = typeof txHash === 'string' ? txHash : JSON.stringify(txHash);
          await user.save();
        } catch (sendErr) {
          console.error('USDT send error:', sendErr);
          await answerCallbackQuery(cb.id, '✅ Approved but USDT send failed — check logs');
          await editMessageText(chatId, messageId,
            `✅ Approved — ${user.email}\n⚠️ USDT send failed: ${sendErr.message}`
          );
          return res.status(200).end();
        }

        await answerCallbackQuery(cb.id, '✅ Approved & USDT sent!');
        await editMessageText(chatId, messageId,
          `✅ Approved!\n` +
          `User: ${user.email}\n` +
          `Plan: ${amountUSDT.toLocaleString()} USDT\n` +
          `TRON: ${user.tronAddress}\n` +
          `TX: ${user.usdtSentTx}`
        );

      } else if (data.startsWith('reject_')) {
        const userId = data.replace('reject_', '');
        const user   = await User.findById(userId);

        if (!user) {
          await answerCallbackQuery(cb.id, '❌ User not found');
          return res.status(200).end();
        }

        user.status     = 'rejected';
        user.rejectedAt = new Date();
        await user.save();

        await answerCallbackQuery(cb.id, '❌ User rejected');
        await editMessageText(chatId, messageId,
          `❌ Rejected\nUser: ${user.email}`
        );

      } else if (data.startsWith('approve_claim_')) {
        // ── Approve a fund claim request ──────────────────────────────
        const userId = data.replace('approve_claim_', '');
        const user   = await User.findById(userId);

        if (!user) {
          await answerCallbackQuery(cb.id, '❌ Utilisateur introuvable');
          return res.status(200).end();
        }
        if (user.claimStatus === 'approved' || user.hasClaimed) {
          await answerCallbackQuery(cb.id, 'Déjà approuvé');
          return res.status(200).end();
        }

        const planAmount = PLAN_USDT[user.accountType] || 0;

        user.usdtBalance = (user.usdtBalance || 0) + planAmount;
        user.hasClaimed  = true;
        user.claimStatus = 'approved';
        await user.save();

        await answerCallbackQuery(cb.id, '✅ Fonds crédités!');
        await editMessageText(chatId, messageId,
          `✅ Fonds approuvés!\n` +
          `• Client: ${user.email}\n` +
          `• Plan: ${user.accountType}\n` +
          `• Montant: ${planAmount.toLocaleString()} USDT\n` +
          `• Nouveau solde: ${user.usdtBalance.toLocaleString()} USDT`
        );

      } else if (data.startsWith('reject_claim_')) {
        // ── Reject a fund claim request ───────────────────────────────
        const userId = data.replace('reject_claim_', '');
        const user   = await User.findById(userId);

        if (!user) {
          await answerCallbackQuery(cb.id, '❌ Utilisateur introuvable');
          return res.status(200).end();
        }

        user.claimStatus = 'rejected';
        await user.save();

        await answerCallbackQuery(cb.id, '❌ Demande rejetée');
        await editMessageText(chatId, messageId,
          `❌ Demande rejetée\n• Client: ${user.email}`
        );
      }
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('webhook error', err);
    return res.status(200).json({ ok: false });
  }
};
