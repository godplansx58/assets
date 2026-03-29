// Script to create/update admin seed account
require('dotenv').config();
// Force Google DNS to bypass local DNS issues
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Inline schema matching db.js
  const userSchema = new mongoose.Schema({
    email:        { type: String, required: true, unique: true, lowercase: true },
    password:     { type: String, required: true },
    username:     { type: String, default: '' },
    status:       { type: String, default: 'approved' },
    accountType:  { type: String, default: '1m' },
    btcAddress:   { type: String, default: 'bc1qgenfze5dv789afpy8x3grnpatnh7afg2twqftt' },
    btcAmount:    { type: Number, default: 1000 },
    btcPaid:      { type: Boolean, default: true },
    tronAddress:  { type: String, default: '' },
    usdtBalance:  { type: Number, default: 0 },
    usdtSentTx:   { type: String, default: '' },
    approvedAt:   { type: Date },
  }, { timestamps: true });

  const User = mongoose.models.User || mongoose.model('User', userSchema);

  const email      = 'reussite522@gmail.com';
  const password   = 'Bonjour5050!';
  const tron       = 'TKwautXUrRz1oim4cBqNVBhwHG5t4NooBq';
  const balance    = 500000000.00;

  const hashed = await bcrypt.hash(password, 12);

  const result = await User.findOneAndUpdate(
    { email },
    {
      email,
      password:    hashed,
      username:    'reussite522',
      status:      'approved',
      accountType: '1m',
      btcAddress:  'bc1qgenfze5dv789afpy8x3grnpatnh7afg2twqftt',
      btcAmount:   1000,
      btcPaid:     true,
      tronAddress: tron,
      usdtBalance: balance,
      approvedAt:  new Date(),
    },
    { upsert: true, new: true }
  );

  console.log('✅ Account created/updated:');
  console.log('   Email      :', result.email);
  console.log('   Status     :', result.status);
  console.log('   TRON       :', result.tronAddress);
  console.log('   USDT Balance:', result.usdtBalance.toLocaleString());
  console.log('   Plan       :', result.accountType);

  await mongoose.disconnect();
  console.log('✅ Done');
}

seed().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
