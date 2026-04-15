const https = require('https');

// Admin JWT (tu devras le générer - utilise l'admin account)
const ADMIN_JWT = process.env.ADMIN_JWT || 'YOUR_ADMIN_JWT_HERE';
const API_URL = 'https://sstr.digital/api/admin/status';

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

async function createUser(userData) {
  return new Promise((resolve) => {
    const payload = {
      action: 'create_account',
      email: userData.email,
      password: userData.password,
      accountType: '1m'
    };

    const options = {
      hostname: 'sstr.digital',
      path: '/api/admin/status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ADMIN_JWT,
        'Content-Length': JSON.stringify(payload).length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok || response.user) {
            console.log(`✅ Created: ${userData.email}`);
            resolve(true);
          } else {
            console.log(`⚠️  ${userData.email}: ${response.error || 'unknown error'}`);
            resolve(false);
          }
        } catch (e) {
          console.log(`❌ ${userData.email}: ${e.message}`);
          resolve(false);
        }
      });
    });

    req.on('error', error => {
      console.log(`❌ ${userData.email}: ${error.message}`);
      resolve(false);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function setupUsers() {
  console.log('🚀 Creating users...');
  for (const user of usersToCreate) {
    await createUser(user);
    await new Promise(resolve => setTimeout(resolve, 500)); // Delay between requests
  }
  console.log('✅ Done!');
}

setupUsers();
