const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function migrate() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    process.stdout.write(`Applying ${file}... `);
    await pool.query(sql);
    process.stdout.write('done\n');
  }

  await pool.end();
  console.log('All migrations applied.');
}

migrate().catch(async (error) => {
  console.error('Migration failed:', error);
  await pool.end();
  process.exit(1);
});
