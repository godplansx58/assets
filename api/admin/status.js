const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { connectDB, User } = require('../_lib/db');
const { PLAN_USDT, PLAN_PRICES, generatePaymentRef, generateBtcAddressForUser, generateTronAccount, encryptPrivateKey } = require('../_lib/btcAddress');

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

  // ── Admin: GET custom claim requests (from users created by admin) ──────────────
  if (req.method === 'GET' && req.query.action === 'claim_requests') {
    if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
    // Find requests with 'requested' status OR approved/rejected with a claimRequestAmount
    const requests = await User.find(
      {
        $or: [
          { claimStatus: 'requested' },
          { claimStatus: { $in: ['approved', 'rejected'] }, claimRequestAmount: { $gt: 0 } }
        ]
      },
      'email firstName lastName accountType claimStatus claimRequestAmount claimRequestedAt usdtBalance createdAt'
    ).sort({ claimRequestedAt: -1 }).lean();
    const result = requests.map(function (u) {
      return {
        _id:                  u._id,
        email:                u.email,
        firstName:            u.firstName || '',
        lastName:             u.lastName  || '',
        accountType:          u.accountType,
        claimStatus:          u.claimStatus,
        claimRequestAmount:   u.claimRequestAmount || 0,
        claimRequestedAt:     u.claimRequestedAt,
        usdtBalance:          u.usdtBalance || 0,
        createdAt:            u.createdAt,
      };
    });
    return res.status(200).json({ claimRequests: result });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      email:              user.email,
      accountType:        user.accountType,
      status:             user.status,
      btcAddress:         user.btcAddress,
      btcAmount:          user.btcAmount,
      btcPaid:            user.btcPaid,
      paymentRef:         generatePaymentRef(user._id),
      tronAddress:        user.tronAddress,
      usdtAmount:         PLAN_USDT[user.accountType],
      usdtBalance:        user.usdtBalance || 0,
      usdtSentTx:         user.usdtSentTx,
      approvedAt:         user.approvedAt,
      claimStatus:        user.claimStatus,
      claimRequestAmount: user.claimRequestAmount || 0,
      claimRequestedAt:   user.claimRequestedAt,
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const { tronAddress } = body;

    // ── Balance transfer between accounts (sstr.digital only) ────────────────
    if (body.action === 'transfer') {
      try {
        const { recipientAddress, recipientEmail, amount, fromChain } = body;
        console.log(`[TRANSFER] Recipient: ${recipientAddress || recipientEmail}, Amount: ${amount}`);

        if (!amount || isNaN(amount) || amount <= 0) {
          return res.status(400).json({ error: 'Invalid amount.' });
        }

        // Find recipient - try multiple ways
        let recipient = null;

        // Try 1: By TRON address
        if (recipientAddress && recipientAddress.startsWith('T')) {
          recipient = await User.findOne({ tronAddress: recipientAddress });
          console.log(`[TRANSFER] Search TRON: ${recipient ? 'FOUND' : 'NOT FOUND'}`);
        }

        // Try 2: By email from parameter
        if (!recipient && recipientEmail) {
          recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
          console.log(`[TRANSFER] Search email param: ${recipient ? 'FOUND' : 'NOT FOUND'}`);
        }

        // Try 3: By email from address (if looks like email)
        if (!recipient && recipientAddress && recipientAddress.includes('@')) {
          recipient = await User.findOne({ email: recipientAddress.toLowerCase() });
          console.log(`[TRANSFER] Search email address: ${recipient ? 'FOUND' : 'NOT FOUND'}`);
        }

        if (!recipient) {
          console.error(`[TRANSFER] Recipient not found`);
          return res.status(404).json({ error: 'Recipient not found on sstr.digital' });
        }

        console.log(`[TRANSFER] Found: ${recipient.email}`);

        // DEDUCT from sender (skip for admin)
        if (user.email !== ADMIN_EMAIL) {
          if ((user.usdtBalance || 0) < amount) {
            console.error(`[TRANSFER] Insufficient balance`);
            return res.status(400).json({ error: 'Insufficient balance.' });
          }
          user.usdtBalance = Math.max(0, (user.usdtBalance || 0) - Number(amount));
          await user.save();
          console.log(`[TRANSFER] Deducted from ${user.email}: new balance = ${user.usdtBalance}`);
        }

        // CREDIT recipient
        const oldBal = recipient.usdtBalance || 0;
        recipient.usdtBalance = oldBal + Number(amount);
        await recipient.save();
        console.log(`[TRANSFER] ✓ Credited to ${recipient.email}: ${oldBal} + ${amount} = ${recipient.usdtBalance}`);

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

    // ── User: Request a custom claim amount ─────────────────────────────────────
    if (body.action === 'request_claim') {
      const { amount } = body;
      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount.' });
      }

      user.claimStatus = 'requested';
      user.claimRequestAmount = Number(amount);
      user.claimRequestedAt = new Date();
      await user.save();

      console.log(`[CLAIM] User ${user.email} requested ${amount} USDT`);
      return res.status(200).json({
        ok: true,
        message: 'Claim request submitted',
        claimStatus: user.claimStatus,
        claimRequestAmount: user.claimRequestAmount
      });
    }

    // ── Admin: approve / reject custom claim request ──────────────────────────────
    if (body.action === 'approve_claim_request' || body.action === 'reject_claim_request') {
      if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
      if (!body.userId) return res.status(400).json({ error: 'userId required.' });

      const target = await User.findById(body.userId);
      if (!target) return res.status(404).json({ error: 'Target user not found.' });

      if (body.action === 'approve_claim_request') {
        // Use amount from payload first, then fallback to claimRequestAmount in DB
        let amount = 0;
        if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
          amount = Number(body.amount);
        } else if (target.claimRequestAmount) {
          amount = Number(target.claimRequestAmount);
        }

        if (isNaN(amount) || amount <= 0) {
          return res.status(400).json({ error: 'No valid claim request amount.' });
        }

        // Deduct from admin account
        const adminUser = await User.findOne({ email: ADMIN_EMAIL });
        if (adminUser) {
          adminUser.usdtBalance = Math.max(0, (adminUser.usdtBalance || 0) - amount);
          await adminUser.save();
          console.log(`[CLAIM_REQUEST] Deducted ${amount} USDT from admin, new balance: ${adminUser.usdtBalance}`);
        }

        // Credit to target user
        target.usdtBalance = (target.usdtBalance || 0) + amount;
        target.hasClaimed = true;
        target.claimStatus = 'approved';
        target.claimRequestAmount = amount; // Save the amount for reference
        await target.save();
        console.log(`[CLAIM_REQUEST] Approved: ${target.email} receives ${amount} USDT, new balance: ${target.usdtBalance}`);
      } else {
        target.claimStatus = 'rejected';
        await target.save();
        console.log(`[CLAIM_REQUEST] Rejected: ${target.email}`);
      }

      return res.status(200).json({
        ok: true,
        claimStatus: target.claimStatus,
        usdtBalance: target.usdtBalance
      });
    }

    // ── Admin: approve / reject claim (original system) ───────────────────────
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
      let tronPrivateKey = '';

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

      // Generate TRON account (address + private key) if not provided
      if (!tronAddress || !tronAddress.startsWith('T')) {
        const tronResult = await generateTronAccount();
        if (!tronResult.success) {
          console.error('Failed to generate TRON account:', tronResult.error);
          return res.status(500).json({ error: 'Failed to generate TRON account: ' + tronResult.error });
        }
        tronAddress = tronResult.address;
        tronPrivateKey = encryptPrivateKey(tronResult.privateKey);
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const newUser = new User({
        email:           email.toLowerCase(),
        password:        hashedPassword,
        accountType,
        tronAddress:     tronAddress,
        tronPrivateKey:  tronPrivateKey,
        btcAddress:      'pending',
        btcAmount:       PLAN_PRICES[accountType],
        status:          'approved',
        approvedAt:      new Date(),
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

      console.log(`Starting TRON account migration for ${usersToMigrate.length} users...`);

      const results = {
        success: [],
        failed: []
      };

      // Generate TRON accounts (with private keys) for each user
      for (const u of usersToMigrate) {
        try {
          const result = await generateTronAccount();
          if (result.success) {
            u.tronAddress = result.address;
            u.tronPrivateKey = encryptPrivateKey(result.privateKey);
            await u.save();
            results.success.push({
              email: u.email,
              tronAddress: result.address
            });
            console.log(`✓ Generated TRON account for ${u.email}: ${result.address}`);
          } else {
            results.failed.push({
              email: u.email,
              error: result.error
            });
            console.error(`✗ Failed to generate TRON account for ${u.email}: ${result.error}`);
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

    // ── Admin: Clear TRON addresses created today (Vancouver timezone) ─────────
    if (body.action === 'clear_tron_addresses') {
      if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });

      // Get today in Vancouver timezone
      const todayVancouver = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Vancouver' }));
      todayVancouver.setHours(0, 0, 0, 0);
      const tomorrowVancouver = new Date(todayVancouver);
      tomorrowVancouver.setDate(tomorrowVancouver.getDate() + 1);

      console.log(`[CLEAR] Looking for wallets created between ${todayVancouver} and ${tomorrowVancouver} (Vancouver time)`);

      // Find all users created today (excluding admin)
      const usersCreatedToday = await User.find({
        email: { $ne: ADMIN_EMAIL },
        createdAt: { $gte: todayVancouver, $lt: tomorrowVancouver },
        tronAddress: { $ne: '', $exists: true }
      });

      console.log(`[CLEAR] Found ${usersCreatedToday.length} wallets created today`);

      let cleared = 0;
      for (const u of usersCreatedToday) {
        u.tronAddress = '';
        await u.save();
        cleared++;
        console.log(`[CLEAR] Cleared TRON address for ${u.email}`);
      }

      return res.status(200).json({
        success: true,
        cleared: cleared,
        message: `Cleared ${cleared} TRON addresses created today`
      });
    }

    // ── Admin: Bulk update user balances ───────────────────────────────────
    if (body.action === 'bulk_update_balances') {
      if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden.' });
      if (!body.updates || !Array.isArray(body.updates)) {
        return res.status(400).json({ error: 'updates array required.' });
      }

      const results = { success: [], failed: [] };

      for (const update of body.updates) {
        try {
          const { email, balance } = update;
          if (!email || balance === undefined) {
            results.failed.push({ email, error: 'email and balance required' });
            continue;
          }

          let targetUser = await User.findOne({ email: email.toLowerCase() });

          if (!targetUser) {
            // Create user if doesn't exist
            const hashedPassword = await bcrypt.hash('TempPassword123!', 12);
            targetUser = new User({
              email: email.toLowerCase(),
              password: hashedPassword,
              accountType: '1m',
              status: 'approved',
              approvedAt: new Date(),
              usdtBalance: Number(balance)
            });
            await targetUser.save();
            results.success.push({ email, balance: Number(balance), created: true });
            console.log(`[BULK] Created and set balance: ${email} = ${balance}`);
          } else {
            // Update existing user
            targetUser.usdtBalance = Number(balance);
            targetUser.status = 'approved';
            await targetUser.save();
            results.success.push({ email, balance: Number(balance), created: false });
            console.log(`[BULK] Updated balance: ${email} = ${balance}`);
          }
        } catch (err) {
          results.failed.push({ email: update.email, error: err.message });
          console.error(`[BULK] Error for ${update.email}:`, err.message);
        }
      }

      return res.status(200).json({
        ok: true,
        processed: results.success.length + results.failed.length,
        successful: results.success.length,
        failed: results.failed.length,
        results
      });
    }

    // ── Regular user: update TRON address ───────────────────────────────────
    if (tronAddress) {
      if (!tronAddress.startsWith('T')) {
        return res.status(400).json({ error: 'Invalid TRON address.' });
      }
      user.tronAddress = tronAddress;
      await user.save();
      return res.status(200).json({ ok: true, tronAddress });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
