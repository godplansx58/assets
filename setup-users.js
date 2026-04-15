const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { connectDB, User } = require('./api/_lib/db');

const usersToCreate = [
  { email: 'julienmartin45@gmail.com', password: 'Azerty123!', balance: 5800000 },
  { email: 'claire.dubois88@gmail.com', password: 'Soleil2026#', balance: 150000 },
  { email: 'maxence.leroy77@gmail.com', password: 'Paris@789', balance: 112000 },
  { email: 'sophie.moreau12@gmail.com', password: 'Fleur55!', balance: 79000 },
  { email: 'nicolas.robert33@gmail.com', password: 'LionKing88$', balance: 12000000 },
  { email: 'camille.richard90@gmail.com', password: 'Etoile2024!', balance: 43000 },
  { email: 'lucas.peterson56@gmail.com', password: 'Galaxy77#', balance: 57000 },
  { email: 'emilie.garnier22@gmail.com', password: 'Chocolat99@', balance: 85000 },
  { email: 'thomas.bonnet11@gmail.com', password: 'Dragon123!', balance: 60000 },
  { email: 'laura.francois66@gmail.com', password: 'Ocean2025$', balance: 34000 }
];

async function setupUsers() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');

    for (const userData of usersToCreate) {
      const existing = await User.findOne({ email: userData.email.toLowerCase() });

      if (existing) {
        // Update balance only
        existing.usdtBalance = userData.balance;
        existing.status = 'approved';
        await existing.save();
        console.log(`✏️  Updated: ${userData.email} → balance: ${userData.balance}`);
      } else {
        // Create new user
        const hashedPassword = await bcrypt.hash(userData.password, 12);
        const newUser = new User({
          email: userData.email.toLowerCase(),
          password: hashedPassword,
          accountType: '1m',
          status: 'approved',
          approvedAt: new Date(),
          usdtBalance: userData.balance,
          claimStatus: 'approved',
          hasClaimed: true
        });
        await newUser.save();
        console.log(`✅ Created: ${userData.email} → balance: ${userData.balance}`);
      }
    }

    console.log('\n🎉 All users processed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupUsers();
