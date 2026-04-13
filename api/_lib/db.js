const mongoose = require('mongoose');

let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  accountType: { type: String, enum: ['10k', '500k', '1m'], required: true },
  btcAddress: { type: String, required: true },
  btcAmount: { type: Number, required: true },
  btcPaid: { type: Boolean, default: false },
  tronAddress: { type: String, default: '' },
  usdtBalance: { type: Number, default: 0 },   // displayed balance in USDT
  usdtSentTx: { type: String, default: '' },
  hasClaimed: { type: Boolean, default: false },
  claimStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  claimMsgId: { type: Number, default: 0 },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  telegramMsgId: { type: Number, default: 0 },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const telemetryEventSchema = new mongoose.Schema({
  eventType: { type: String, default: 'unknown', index: true },
  page: { type: String, default: '/' },
  action: { type: String, default: '' },
  details: { type: String, default: '' },
  sessionId: { type: String, default: 'anonymous', index: true },
  userId: { type: String, default: 'guest', index: true },
  email: { type: String, default: '', index: true },
  wallet: { type: String, default: '', index: true },
  userAgent: { type: String, default: '' },
  ip: { type: String, default: '' },
  city: { type: String, default: '' },
  country: { type: String, default: '' },
  location: { type: String, default: '' },
  ts: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

const TelemetryEvent = mongoose.models.TelemetryEvent || mongoose.model('TelemetryEvent', telemetryEventSchema);

module.exports = { connectDB, User, TelemetryEvent };
