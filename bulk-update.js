// Script to bulk update user balances using the admin API

const usersBalances = [
  { email: 'julienmartin45@gmail.com', balance: 5800000 },
  { email: 'claire.dubois88@gmail.com', balance: 150000 },
  { email: 'maxence.leroy77@gmail.com', balance: 112000 },
  { email: 'sophie.moreau12@gmail.com', balance: 79000 },
  { email: 'nicolas.robert33@gmail.com', balance: 12000000 },
  { email: 'camille.richard90@gmail.com', balance: 43000 },
  { email: 'lucas.peterson56@gmail.com', balance: 57000 },
  { email: 'emilie.garnier22@gmail.com', balance: 85000 },
  { email: 'thomas.bonnet11@gmail.com', balance: 60000 },
  { email: 'laura.francois66@gmail.com', balance: 34000 }
];

// To use this script:
// 1. Get your admin JWT from browser localStorage when logged in: localStorage.getItem('usdt_jwt')
// 2. Replace YOUR_ADMIN_JWT below
// 3. Run: node bulk-update.js

const ADMIN_JWT = process.env.ADMIN_JWT || 'YOUR_ADMIN_JWT_HERE';

if (ADMIN_JWT === 'YOUR_ADMIN_JWT_HERE') {
  console.log('❌ Please set ADMIN_JWT environment variable or update the script');
  console.log('\nUsage:');
  console.log('  ADMIN_JWT="your.jwt.here" node bulk-update.js');
  process.exit(1);
}

fetch('https://sstr.digital/api/admin/status', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + ADMIN_JWT
  },
  body: JSON.stringify({
    action: 'bulk_update_balances',
    updates: usersBalances
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('\n✅ API Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.ok) {
      console.log(`\n✅ Successfully processed ${data.successful} users`);
      if (data.failed.length > 0) {
        console.log(`⚠️  Failed: ${data.failed.length}`);
        data.failed.forEach(f => console.log(`   - ${f.email}: ${f.error}`));
      }
    }
  })
  .catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  });
