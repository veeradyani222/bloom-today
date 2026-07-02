const jwt = require('jsonwebtoken');

const DEV_ADMIN_GOOGLE_SUB = 'dev-admin-local';
const DEV_ADMIN_EMAIL = 'dev-admin@bloom.local';
const DEV_ADMIN_NAME = 'Dev Admin';
const DEV_ADMIN_KEYS = {
  shareKey: 'DEVKEY',
  therapistShareKey: 'DEVTHER',
  trustedShareKey: 'DEVTRUST',
};
const DEV_ADMIN_AVATAR_IDS = ['brunette', 'mpfb', 'avaturn', 'avatarsdk'];
const DEV_ADMIN_VOICE_IDS = [
  'Achernar',
  'Achird',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Charon',
  'Despina',
  'Enceladus',
  'Erinome',
  'Fenrir',
  'Gacrux',
  'Iapetus',
  'Kore',
  'Laomedeia',
  'Leda',
  'Orus',
  'Pulcherrima',
  'Puck',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Sulafat',
  'Umbriel',
  'Vindemiatrix',
  'Zephyr',
  'Zubenelgenubi',
];

function isDevAdminAuthEnabled(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv !== 'production';
}

function buildDevAdminSession(user, jwtSecret) {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      authRole: 'mom',
    },
    jwtSecret,
    { expiresIn: '7d' },
  );

  return {
    accessToken,
    user: {
      ...user,
      auth_role: 'mom',
      is_dev_admin: true,
    },
    actor: null,
  };
}

async function upsertDevAdminUser(pool) {
  const result = await pool.query(
    `
    INSERT INTO users (
      google_sub, email, full_name, avatar_url, onboarding_completed,
      companion_name, companion_instructions, companion_avatar_id, companion_voice_name,
      share_key, therapist_share_key, trusted_share_key, preferred_dashboard_role
    )
    VALUES ($1, $2, $3, NULL, TRUE, $4, $5, $6, $7, $8, $9, $10, 'mom')
    ON CONFLICT (google_sub)
    DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      onboarding_completed = TRUE,
      companion_name = COALESCE(users.companion_name, EXCLUDED.companion_name),
      companion_instructions = COALESCE(users.companion_instructions, EXCLUDED.companion_instructions),
      companion_avatar_id = CASE
        WHEN users.companion_avatar_id = ANY($11)
          THEN users.companion_avatar_id
        ELSE EXCLUDED.companion_avatar_id
      END,
      companion_voice_name = CASE
        WHEN users.companion_voice_name = ANY($12)
          THEN users.companion_voice_name
        ELSE EXCLUDED.companion_voice_name
      END,
      share_key = COALESCE(users.share_key, EXCLUDED.share_key),
      therapist_share_key = COALESCE(users.therapist_share_key, EXCLUDED.therapist_share_key),
      trusted_share_key = COALESCE(users.trusted_share_key, EXCLUDED.trusted_share_key),
      preferred_dashboard_role = 'mom',
      updated_at = NOW()
    RETURNING id, email, full_name, avatar_url, onboarding_completed,
              companion_name, companion_instructions, companion_agent_id,
              companion_session_id, companion_avatar_id, companion_voice_name,
              share_key, therapist_share_key, trusted_share_key,
              preferred_dashboard_role, onboarding_assessment;
    `,
    [
      DEV_ADMIN_GOOGLE_SUB,
      DEV_ADMIN_EMAIL,
      DEV_ADMIN_NAME,
      'Luna',
      'Be warm and practical.',
      'brunette',
      'Aoede',
      DEV_ADMIN_KEYS.shareKey,
      DEV_ADMIN_KEYS.therapistShareKey,
      DEV_ADMIN_KEYS.trustedShareKey,
      DEV_ADMIN_AVATAR_IDS,
      DEV_ADMIN_VOICE_IDS,
    ],
  );

  return result.rows[0];
}

module.exports = {
  buildDevAdminSession,
  isDevAdminAuthEnabled,
  upsertDevAdminUser,
};
