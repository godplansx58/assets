const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');
const { PLAN_USDT, PLAN_PRICES, generatePaymentRef, generateBtcAddressForUser, generateTronAddress } = require('../_lib/btcAddress');

const ADMIN_EMAIL = 'reussite522@gmail.com';

/**
 * GET  /api/admin/status?token=JWT            — check account status (used by frontend polling)
 * GET  /api/admin/status?action=claims        — list claim requests (admin only)
 * GET  /api/admin/status?action=accounts      — list all accounts with balances (admin only)
 * POST /api/admin/status { action: 'create_account', ... } — create account (admin only)
 * POST /api/admin/status { action: 'transfer', ... } — transfer balance (admin only)
 * POST /api/admin/status { action: 'approve_claim', ... } — approve/reject claim (admin only)
 * POST /api/admin/status { tronAddress }      — update TRON address for logged-in user
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim() || req.query.token;

  if (!token) return res.status(401).json({ error: 'No token provided.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  await connectDB();
  const user = await User.findById(decoded.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // ── Admin: GET claim requests ──────────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'claims') {
    if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
    const claims = await User.find(
      { claimStatus: { $in: ['pending', 'approved', 'rejected'] } },
      'email firstName lastName accountType claimStatus usdtBalance createdAt'
    ).sort({ createdAt: -1 }).lean();
    const result = claims.map(function (u) {
      return {
        _id:         u._id,
        email:       u.email,
        firstName:   u.firstName || '',
        lastName:    u.lastName  || '',
        accountType: u.accountType,
        planAmount:  PLAN_USDT[u.accountType] || 0,
        claimStatus: u.claimStatus,
        usdtBalance: u.usdtBalance,
        createdAt:   u.createdAt,
      };
    });
    return res.status(200).json({ claims: result });
  }

  // ── Admin: GET all active accounts with balances ────────────────────────────
  if (req.method === 'GET' && req.query.action === 'accounts') {
    if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
    const accounts = await User.find(
      { status: 'approved' },
      'email firstName lastName accountType usdtBalance tronAddress status createdAt'
    ).sort({ createdAt: -1 }).lean();
    const result = accounts.map(function (u) {
      return {
        _id:         u._id,
        email:       u.email,
        firstName:   u.firstName || '',
        lastName:    u.lastName  || '',
        accountType: u.accountType,
        usdtBalance: u.usdtBalance || 0,
        tronAddress: u.tronAddress || '—',
        status:      u.status,
        createdAt:   u.createdAt,
      };
    });
    return res.status(200).json({ accounts: result });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      email:       user.email,
      accountType: user.accountType,
      status:      user.status,
      btcAddress:  user.btcAddress,
      btcAmount:   user.btcAmount,
      btcPaid:     user.btcPaid,
      paymentRef:  generatePaymentRef(user._id),
      tronAddress: user.tronAddress,
      usdtAmount:  PLAN_USDT[user.accountType],
      usdtBalance: user.usdtBalance || 0,
      usdtSentTx:  user.usdtSentTx,
      approvedAt:  user.approvedAt,
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    // ── Balance transfer between accounts ────────────────────────────────────
    if (body.action === 'transfer') {
      try {
        const { recipientAddress, recipientEmail, amount, fromChain } = body;
        console.log(`[TRANSFER] Starting: recipient=${recipientAddress || recipientEmail}, amount=${amount}`);

        if (!amount || isNaN(amount) || amount <= 0) {
          console.error('[TRANSFER] Invalid amount');
          return res.status(400).json({ error: 'Invalid amount.' });
        }

        // Find recipient by tronAddress or email
        let recipient = null;

        // Try 1: Search by TRON address (if looks like TRON address)
        if (recipientAddress && recipientAddress.startsWith('T') && recipientAddress.length > 30) {
          console.log(`[TRANSFER] Searching by TRON: ${recipientAddress}`);
          recipient = await User.findOne({ tronAddress: recipientAddress });
          console.log(`[TRANSFER] Found by TRON: ${recipient ? recipient.email : 'NOT FOUND'}`);
        }

        // Try 2: Search by email if provided
        if (!recipient && recipientEmail) {
          console.log(`[TRANSFER] Searching by email: ${recipientEmail}`);
          recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
          console.log(`[TRANSFER] Found by email: ${recipient ? recipient.email : 'NOT FOUND'}`);
        }

        // Try 3: If recipientAddress looks like email, search by email
        if (!recipient && recipientAddress && recipientAddress.includes('@')) {
          console.log(`[TRANSFER] Searching email from address: ${recipientAddress}`);
          recipient = await User.findOne({ email: recipientAddress.toLowerCase() });
          console.log(`[TRANSFER] Found: ${recipient ? recipient.email : 'NOT FOUND'}`);
        }

        // Try 4: If we have TRON address but didn't find by it, search all users and compare wallets
        if (!recipient && recipientAddress && recipientAddress.startsWith('T')) {
          console.log(`[TRANSFER] TRON address not found in DB, searching by any tronAddress field...`);
          // This handles case where address might be from external wallet
          const allUsers = await User.find({});
          recipient = allUsers.find(u => u.tronAddress === recipientAddress);
          if (recipient) console.log(`[TRANSFER] Found after full scan: ${recipient.email}`);
        }

        if (!recipient) {
          console.error(`[TRANSFER] Recipient not found!`);
          return res.status(404).json({ error: 'Recipient not found on platform.' });
        }

        console.log(`[TRANSFER] Found recipient: ${recipient.email}, current balance: ${recipient.usdtBalance}`);

        // Deduct from sender if not admin and not fromChain
        if (user.email !== ADMIN_EMAIL && !fromChain) {
          if ((user.usdtBalance || 0) < amount) {
            console.error(`[TRANSFER] Insufficient: ${user.usdtBalance} < ${amount}`);
            return res.status(400).json({ error: 'Insufficient balance.' });
          }
          user.usdtBalance = Math.max(0, (user.usdtBalance || 0) - Number(amount));
          await user.save();
          console.log(`[TRANSFER] Deducted from ${user.email}: new=${user.usdtBalance}`);
        }

        // Credit recipient
        const oldBal = recipient.usdtBalance || 0;
        recipient.usdtBalance = oldBal + Number(amount);
        await recipient.save();
        console.log(`[TRANSFER] ✓ Credited to ${recipient.email}: ${oldBal} + ${amount} = ${recipient.usdtBalance}`);

        // Verify the save worked
        const verify = await User.findById(recipient._id);
        console.log(`[TRANSFER] Verification: ${verify.email} = ${verify.usdtBalance}`);

        return res.status(200).json({
          ok: true,
          recipientEmail: recipient.email,
          recipientNewBalance: recipient.usdtBalance,
          senderNewBalance: user.usdtBalance,
        });
      } catch (err) {
        console.error('[TRANSFER] ERROR:', err.message);
        return res.status(500).json({ error: 'Transfer failed: ' + err.message });
      }
    }

    // ── Admin: approve / reject claim ───────────────────────────────────────
    if (body.action === 'approve_claim' || body.action === 'reject_claim') {
      if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
      if (!body.userId) return res.status(400).json({ error: 'userId required.' });

      const target = await User.findById(body.userId);
      if (!target) return res.status(404).json({ error: 'Target user not found.' });

      if (body.action === 'approve_claim') {
        const amount = PLAN_USDT[target.accountType] || 0;
        target.usdtBalance = (target.usdtBalance || 0) + amount;
        target.hasClaimed  = true;
        target.claimStatus = 'approved';
      } else {
        target.claimStatus = 'rejected';
      }
      await target.save();
      return res.status(200).json({ ok: true, claimStatus: target.claimStatus });
    }

    // ── Admin: create account ──────────────────────────────────────────────────
    if (body.action === 'create_account') {
      if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });

      let { email, password, accountType, tronAddress } = body;

      if (!email || !password || !accountType) {
        return res.status(400).json({ error: 'Email, password and account type are required.' });
      }
      if (!['10k', '500k', '1m'].includes(accountType)) {
        return res.status(400).json({ error: 'Invalid account type.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }
      const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRx.test(email)) {
        return res.status(400).json({ error: 'Invalid email address.' });
      }

      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

      // Generate TRON address if not provided
      if (!tronAddress || !tronAddress.startsWith('T')) {
        const tronResult = await generateTronAddress();
        if (!tronResult.success) {
          console.error('Failed to generate TRON address:', tronResult.error);
          return res.status(500).json({ error: 'Failed to generate TRON address: ' + tronResult.error });
        }
        tronAddress = tronResult.address;
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const newUser = new User({
        email:       email.toLowerCase(),
        password:    hashedPassword,
        accountType,
        tronAddress: tronAddress,
        btcAddress:  'pending',
        btcAmount:   PLAN_PRICES[accountType],
        status:      'approved',
        approvedAt:  new Date(),
      });
      await newUser.save();

      const btcAddress = generateBtcAddressForUser(newUser._id);
      const paymentRef = generatePaymentRef(newUser._id);
      newUser.btcAddress = btcAddress;
      await newUser.save();

      return res.status(201).json({
        ok: true,
        user: {
          _id:         newUser._id,
          email:       newUser.email,
          accountType: newUser.accountType,
          status:      newUser.status,
          btcAddress,
          btcAmount:   PLAN_PRICES[accountType],
          paymentRef,
          tronAddress: newUser.tronAddress,
          usdtAmount:  PLAN_USDT[accountType],
          createdAt:   newUser.createdAt,
        },
      });
    }

    // ── Admin: migrate TRON addresses for existing users ──────────────────────
    if (body.action === 'migrate_tron_addresses') {
      if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });

      // Find all users without a TRON address
      const usersToMigrate = await User.find({
        $or: [
          { tronAddress: { $exists: false } },
          { tronAddress: null },
          { tronAddress: '' }
        ]
      });

      if (usersToMigrate.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No users need migration',
          migrated: 0,
          total: 0,
          results: { success: [], failed: [] }
        });
      }

      console.log(`Starting TRON address migration for ${usersToMigrate.length} users...`);

      const results = {
        success: [],
        failed: []
      };

      // Generate TRON addresses for each user
      for (const u of usersToMigrate) {
        try {
          const result = await generateTronAddress();
          if (result.success) {
            u.tronAddress = result.address;
            await u.save();
            results.success.push({
              email: u.email,
              tronAddress: result.address
            });
            console.log(`✓ Generated TRON address for ${u.email}: ${result.address}`);
          } else {
            results.failed.push({
              email: u.email,
              error: result.error
            });
            console.error(`✗ Failed to generate TRON address for ${u.email}: ${result.error}`);
          }
        } catch (err) {
          results.failed.push({
            email: u.email,
            error: err.message
          });
          console.error(`✗ Error migrating ${u.email}:`, err);
        }
      }

      return res.status(200).json({
        success: true,
        migrated: results.success.length,
        total: usersToMigrate.length,
        results
      });
    }

    // ── Regular user: update TRON address ───────────────────────────────────
    const { tronAddress } = body;
    if (!tronAddress || !tronAddress.startsWith('T')) {
      return res.status(400).json({ error: 'Invalid TRON address.' });
    }
    user.tronAddress = tronAddress;
    await user.save();
    return res.status(200).json({ ok: true, tronAddress });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
