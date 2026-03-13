const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { pool } = require('../db');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    console.warn(`[AUTH] missing_token method=${req.method} path=${req.path}`);
    return res.status(401).json({ error: 'Missing access token.' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);

    const authRole = payload.authRole || 'mom';
    if (authRole !== 'mom') {
      if (!payload.linkId || !payload.targetUserId || !payload.keyVersion) {
        return res.status(401).json({ error: 'Invalid support role session.' });
      }

      const linkRes = await pool.query(
        `
        SELECT srl.id,
               u.therapist_key_version,
               u.trusted_key_version
        FROM support_role_links srl
        JOIN users u ON u.id = srl.owner_user_id
        WHERE srl.id = $1
          AND srl.owner_user_id = $2
          AND srl.support_user_id = $3
          AND srl.role_type = $4
        `,
        [payload.linkId, payload.targetUserId, payload.userId, authRole],
      );

      if (!linkRes.rows.length) {
        return res.status(401).json({ error: 'This support role session is no longer active. Please log in again.' });
      }

      const owner = linkRes.rows[0];
      const expectedVersion = authRole === 'therapist'
        ? owner.therapist_key_version
        : owner.trusted_key_version;

      if (Number(expectedVersion) !== Number(payload.keyVersion)) {
        return res.status(401).json({ error: 'Support key changed. Please log in again with the new key.' });
      }
    }

    console.log(`[AUTH] verified userId=${payload.userId} path=${req.path}`);
    req.auth = payload;
    return next();
  } catch (error) {
    console.warn(`[AUTH] invalid_token path=${req.path} message="${error.message}"`);
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

module.exports = { authMiddleware };
