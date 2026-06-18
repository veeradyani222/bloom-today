const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

const originalQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  const queryText = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
  const startedAt = Date.now();
  try {
    const result = await originalQuery(...args);
    const elapsed = Date.now() - startedAt;
    console.log(
      `[DB] query_ok ms=${elapsed} rows=${result.rowCount ?? 0} sql="${queryText
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)}"`,
    );
    return result;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    console.error(
      `[DB] query_error ms=${elapsed} code=${error.code || 'unknown'} message="${error.message}" sql="${queryText
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)}"`,
    );
    throw error;
  }
};

pool.on('error', (error) => {
  console.error('[DB] pool_error', error);
});

module.exports = { pool };
