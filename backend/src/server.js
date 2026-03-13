const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { z } = require('zod');

const { config } = require('./config');
const { pool } = require('./db');
const { authMiddleware } = require('./middleware/auth');
const { generateShareKey } = require('./utils/codes');
const { createGoogleAdkCompanion, runCompanionTurn } = require('./services/googleAdk');
const {
  analyzeCallSession,
  getContextualQuickTips,
  getDashboardInsights,
  getMoodPointSeries,
  recordCallMemory,
} = require('./services/dashboardInsights');
const {
  DEFAULT_GEMINI_VOICE,
  GEMINI_VOICE_IDS,
  GEMINI_VOICE_OPTIONS,
  synthesizePreviewSpeech,
} = require('./services/geminiVoice');

const app = express();
const googleClient = new OAuth2Client(config.googleClientId);

app.use((req, res, next) => {
  const startedAt = Date.now();
  console.log(`[HTTP] -> ${req.method} ${req.path}`);
  res.on('finish', () => {
    console.log(`[HTTP] <- ${req.method} ${req.path} status=${res.statusCode} ms=${Date.now() - startedAt}`);
  });
  next();
});

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

const googleAuthSchema = z.object({
  credential: z.string().min(20),
});

const roleGoogleAuthSchema = z.object({
  credential: z.string().min(20),
  role: z.enum(['mom', 'therapist', 'trusted']),
  supportKey: z.string().trim().min(4).max(16).optional(),
});

const supportRoleSwitchSchema = z.object({
  role: z.enum(['therapist', 'trusted']),
  supportKey: z.string().trim().min(4).max(16),
});

const rotateKeySchema = z.object({
  type: z.enum(['therapist', 'trusted']),
});

const therapistNoteSchema = z.object({
  message: z.string().trim().max(1200).optional().default(''),
  companionInstruction: z.string().trim().max(1200).optional().default(''),
});

const trustedNoteSchema = z.object({
  message: z.string().trim().min(1).max(1200),
});

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
});

const switchClientSchema = z.object({
  targetUserId: z.string().uuid(),
});

const addClientKeySchema = z.object({
  key: z.string().trim().min(4).max(16),
});

function normalizeKey(raw = '') {
  return String(raw || '').trim().toUpperCase();
}

function getAuthContext(req) {
  const authRole = req.auth?.authRole || 'mom';
  const actorUserId = req.auth?.userId;
  const ownerUserId = authRole === 'mom' ? actorUserId : req.auth?.targetUserId;
  return { authRole, actorUserId, ownerUserId };
}

function requireMomRole(req, res) {
  const { authRole } = getAuthContext(req);
  if (authRole !== 'mom') {
    res.status(403).json({ error: 'This action is only available in New Mom mode.' });
    return false;
  }
  return true;
}

function requireTherapistRole(req, res) {
  const { authRole } = getAuthContext(req);
  if (authRole !== 'therapist') {
    res.status(403).json({ error: 'This action is only available in Therapist mode.' });
    return false;
  }
  return true;
}

app.post('/api/auth/google', async (req, res) => {
  try {
    console.log('[AUTH] google_login_start');
    const { credential } = googleAuthSchema.parse(req.body);

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      return res.status(400).json({ error: 'Invalid Google token payload.' });
    }

    const googleSub = payload.sub;
    const email = payload.email.toLowerCase();
    const avatarUrl = payload.picture || null;

    const upsert = await pool.query(
      `
      INSERT INTO users (google_sub, email, avatar_url, share_key, therapist_share_key, trusted_share_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (google_sub)
      DO UPDATE SET
        email = EXCLUDED.email,
        avatar_url = EXCLUDED.avatar_url,
        therapist_share_key = COALESCE(users.therapist_share_key, EXCLUDED.therapist_share_key),
        trusted_share_key = COALESCE(users.trusted_share_key, EXCLUDED.trusted_share_key),
        updated_at = NOW()
      RETURNING id, email, full_name, avatar_url, onboarding_completed, companion_name, companion_instructions, companion_agent_id, companion_session_id, companion_avatar_id, companion_voice_name, share_key, therapist_share_key, trusted_share_key, preferred_dashboard_role, onboarding_assessment;
      `,
      [googleSub, email, avatarUrl, generateShareKey(), generateShareKey(), generateShareKey()],
    );

    const user = upsert.rows[0];
    console.log(`[AUTH] google_login_ok userId=${user.id} email=${user.email}`);

    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        authRole: 'mom',
      },
      config.jwtSecret,
      { expiresIn: '7d' },
    );

    return res.json({ accessToken, user });
  } catch (error) {
    console.error('[AUTH] google_login_error', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid payload.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Google auth failed.' });
  }
});

app.post('/api/auth/google-role', async (req, res) => {
  try {
    const input = roleGoogleAuthSchema.parse(req.body);

    if (input.role !== 'mom' && !input.supportKey?.trim()) {
      return res.status(400).json({ error: 'A support key is required for therapist or trusted access.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: input.credential,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      return res.status(400).json({ error: 'Invalid Google token payload.' });
    }

    const googleSub = payload.sub;
    const email = payload.email.toLowerCase();
    const avatarUrl = payload.picture || null;

    const upsert = await pool.query(
      `
      INSERT INTO users (google_sub, email, avatar_url, share_key, therapist_share_key, trusted_share_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (google_sub)
      DO UPDATE SET
        email = EXCLUDED.email,
        avatar_url = EXCLUDED.avatar_url,
        therapist_share_key = COALESCE(users.therapist_share_key, EXCLUDED.therapist_share_key),
        trusted_share_key = COALESCE(users.trusted_share_key, EXCLUDED.trusted_share_key),
        updated_at = NOW()
      RETURNING id, email, full_name, avatar_url;
      `,
      [googleSub, email, avatarUrl, generateShareKey(), generateShareKey(), generateShareKey()],
    );

    const actor = upsert.rows[0];

    if (input.role === 'mom') {
      const userRes = await pool.query(
        `
        SELECT id, email, full_name, avatar_url, onboarding_completed,
               companion_name, companion_instructions, companion_agent_id,
               companion_avatar_id, companion_voice_name,
               share_key, therapist_share_key, trusted_share_key, created_at, companion_session_id,
               preferred_dashboard_role, onboarding_assessment
        FROM users
        WHERE id = $1
        `,
        [actor.id],
      );

      const accessToken = jwt.sign(
        {
          userId: actor.id,
          email: actor.email,
          authRole: 'mom',
        },
        config.jwtSecret,
        { expiresIn: '7d' },
      );

      return res.json({ accessToken, user: userRes.rows[0] });
    }

    const normalizedKey = normalizeKey(input.supportKey);
    const keyColumn = input.role === 'therapist' ? 'therapist_share_key' : 'trusted_share_key';

    const ownerRes = await pool.query(
      `
      SELECT id, full_name, email, onboarding_completed,
             companion_name, companion_instructions, companion_agent_id,
             companion_avatar_id, companion_voice_name,
             share_key, therapist_share_key, trusted_share_key, created_at, companion_session_id,
             preferred_dashboard_role, onboarding_assessment,
             therapist_key_version, trusted_key_version
      FROM users
      WHERE ${keyColumn} = $1
      `,
      [normalizedKey],
    );

    if (!ownerRes.rows.length) {
      return res.status(400).json({ error: 'No mom found with that key. Please check the code and try again.' });
    }

    const owner = ownerRes.rows[0];
    if (owner.id === actor.id) {
      return res.status(400).json({ error: 'You cannot use your own support key here.' });
    }

    if (!owner.onboarding_completed) {
      return res.status(400).json({ error: 'This key belongs to an account that has not completed setup yet. Please ask them to finish onboarding first.' });
    }

    const linkRes = await pool.query(
      `
      INSERT INTO support_role_links (owner_user_id, support_user_id, role_type, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (owner_user_id, support_user_id, role_type)
      DO UPDATE SET updated_at = NOW()
      RETURNING id
      `,
      [owner.id, actor.id, input.role],
    );

    const keyVersion = input.role === 'therapist'
      ? owner.therapist_key_version
      : owner.trusted_key_version;

    const accessToken = jwt.sign(
      {
        userId: actor.id,
        email: actor.email,
        authRole: input.role,
        targetUserId: owner.id,
        linkId: linkRes.rows[0].id,
        keyVersion,
      },
      config.jwtSecret,
      { expiresIn: '7d' },
    );

    return res.json({
      accessToken,
      user: {
        ...owner,
        auth_role: input.role,
        support_user_name: actor.full_name || '',
        support_user_email: actor.email || '',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid payload.' });
    }
    console.error('[AUTH] role_login_error', error);
    return res.status(500).json({ error: 'Role login failed.' });
  }
});

app.use('/api', authMiddleware);

app.post('/api/auth/switch-support-role', async (req, res) => {
  const { authRole, actorUserId } = getAuthContext(req);
  if (authRole !== 'mom') {
    return res.status(403).json({ error: 'Switching into support mode is only available from New Mom mode.' });
  }

  try {
    const input = supportRoleSwitchSchema.parse(req.body);
    const normalizedKey = normalizeKey(input.supportKey);
    const keyColumn = input.role === 'therapist' ? 'therapist_share_key' : 'trusted_share_key';

    const ownerRes = await pool.query(
      `
      SELECT id, full_name, email, avatar_url, onboarding_completed,
             companion_name, companion_instructions, companion_agent_id,
             companion_avatar_id, companion_voice_name,
             share_key, therapist_share_key, trusted_share_key, created_at, companion_session_id,
             preferred_dashboard_role, onboarding_assessment,
             therapist_key_version, trusted_key_version
      FROM users
      WHERE ${keyColumn} = $1
      `,
      [normalizedKey],
    );

    if (!ownerRes.rows.length) {
      return res.status(400).json({ error: 'No mom found with that key. Please check the code and try again.' });
    }

    const owner = ownerRes.rows[0];
    if (owner.id === actorUserId) {
      return res.status(400).json({ error: 'You cannot use your own support key here.' });
    }

    if (!owner.onboarding_completed) {
      return res.status(400).json({ error: 'This key belongs to an account that has not completed setup yet. Please ask them to finish onboarding first.' });
    }

    const linkRes = await pool.query(
      `
      INSERT INTO support_role_links (owner_user_id, support_user_id, role_type, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (owner_user_id, support_user_id, role_type)
      DO UPDATE SET updated_at = NOW()
      RETURNING id
      `,
      [owner.id, actorUserId, input.role],
    );

    const actorRes = await pool.query(
      `SELECT full_name, email FROM users WHERE id = $1`,
      [actorUserId],
    );

    const keyVersion = input.role === 'therapist'
      ? owner.therapist_key_version
      : owner.trusted_key_version;

    const accessToken = jwt.sign(
      {
        userId: actorUserId,
        email: actorRes.rows[0]?.email || '',
        authRole: input.role,
        targetUserId: owner.id,
        linkId: linkRes.rows[0].id,
        keyVersion,
      },
      config.jwtSecret,
      { expiresIn: '7d' },
    );

    return res.json({
      accessToken,
      user: {
        ...owner,
        auth_role: input.role,
        support_user_name: actorRes.rows[0]?.full_name || '',
        support_user_email: actorRes.rows[0]?.email || '',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid payload.' });
    }
    console.error('[AUTH] switch_support_role_error', error);
    return res.status(500).json({ error: 'Could not switch support role.' });
  }
});

app.get('/api/me', async (req, res) => {
  const { authRole, actorUserId, ownerUserId } = getAuthContext(req);
  const result = await pool.query(
    `
    SELECT u.id, u.email, u.full_name, u.avatar_url, u.onboarding_completed,
           u.companion_name, u.companion_instructions, u.companion_agent_id,
           u.companion_avatar_id, u.companion_voice_name,
           u.share_key, u.therapist_share_key, u.trusted_share_key, u.created_at, u.companion_session_id,
           u.preferred_dashboard_role, u.onboarding_assessment,
           c.id AS companion_id, c.name AS comp_name,
           c.user_instructions AS comp_user_instructions,
           c.therapist_instructions AS comp_therapist_instructions,
           c.base_prompt AS comp_base_prompt, c.avatar_id AS comp_avatar_id,
           c.voice_name AS comp_voice_name,
           c.agent_id AS comp_agent_id, c.session_id AS comp_session_id
    FROM users u
    LEFT JOIN companions c ON c.user_id = u.id
    WHERE u.id = $1
    `,
    [ownerUserId],
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const row = result.rows[0];
  const latestTherapistMessageRes = await pool.query(
    `
    SELECT message_text, companion_instruction, created_at
    FROM therapist_notes
    WHERE owner_user_id = $1
      AND message_text <> ''
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [ownerUserId],
  );

  const latestTherapistMessage = latestTherapistMessageRes.rows[0] || null;

  const latestTrustedMessageRes = await pool.query(
    `
    SELECT message_text, created_at
    FROM trusted_notes
    WHERE owner_user_id = $1
      AND message_text <> ''
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [ownerUserId],
  );

  const latestTrustedMessage = latestTrustedMessageRes.rows[0] || null;

  const memoriesRes = await pool.query(
    `SELECT content FROM user_memories WHERE user_id = $1 ORDER BY level ASC, bucket_date ASC LIMIT 10`,
    [ownerUserId],
  );
  const userMemories = memoriesRes.rows.map((r) => r.content);

  let actorProfile = null;
  if (actorUserId) {
    const actorProfileRes = await pool.query(
      `SELECT full_name, email FROM users WHERE id = $1`,
      [actorUserId],
    );
    actorProfile = actorProfileRes.rows[0] || null;
  }

  const user = {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    onboarding_completed: row.onboarding_completed,
    companion_name: row.companion_name,
    companion_instructions: row.companion_instructions,
    companion_agent_id: row.companion_agent_id,
    companion_session_id: row.companion_session_id,
    companion_avatar_id: row.companion_avatar_id,
    companion_voice_name: row.companion_voice_name,
    share_key: authRole === 'mom' ? row.share_key : null,
    therapist_share_key: authRole === 'mom' ? row.therapist_share_key : null,
    trusted_share_key: authRole === 'mom' ? row.trusted_share_key : null,
    created_at: row.created_at,
    preferred_dashboard_role: row.preferred_dashboard_role,
    onboarding_assessment: row.onboarding_assessment,
    auth_role: authRole,
    support_user_name: authRole !== 'mom' ? (actorProfile?.full_name || '') : null,
    support_user_email: authRole !== 'mom' ? (actorProfile?.email || '') : null,
    latest_therapist_message: latestTherapistMessage
      ? {
        text: latestTherapistMessage.message_text,
        created_at: latestTherapistMessage.created_at,
      }
      : null,
    latest_trusted_message: latestTrustedMessage
      ? {
        text: latestTrustedMessage.message_text,
        created_at: latestTrustedMessage.created_at,
      }
      : null,
    memories: userMemories,
  };

  if (row.companion_id) {
    user.companion = {
      id: row.companion_id,
      name: row.comp_name,
      user_instructions: row.comp_user_instructions,
      therapist_instructions: row.comp_therapist_instructions,
      base_prompt: row.comp_base_prompt,
      avatar_id: row.comp_avatar_id,
      voice_name: row.comp_voice_name,
      agent_id: row.comp_agent_id,
      session_id: row.comp_session_id,
    };
  }

  return res.json({
    user,
    actor: {
      id: actorUserId,
      role: authRole,
      ownerUserId,
      full_name: actorProfile?.full_name || '',
      email: actorProfile?.email || '',
    },
  });
});

app.get('/api/me/support-keys', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId } = getAuthContext(req);

  const result = await pool.query(
    `
    SELECT therapist_share_key, trusted_share_key
    FROM users
    WHERE id = $1
    `,
    [ownerUserId],
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'User not found.' });
  }

  return res.json({
    therapistKey: result.rows[0].therapist_share_key,
    trustedKey: result.rows[0].trusted_share_key,
  });
});

app.post('/api/me/support-keys/rotate', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId } = getAuthContext(req);

  try {
    const { type } = rotateKeySchema.parse(req.body);
    const keyColumn = type === 'therapist' ? 'therapist_share_key' : 'trusted_share_key';
    const versionColumn = type === 'therapist' ? 'therapist_key_version' : 'trusted_key_version';
    const newKey = generateShareKey();

    await pool.query('BEGIN');

    const updated = await pool.query(
      `
      UPDATE users
      SET ${keyColumn} = $1,
          ${versionColumn} = ${versionColumn} + 1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING ${keyColumn}
      `,
      [newKey, ownerUserId],
    );

    await pool.query(
      `
      DELETE FROM support_role_links
      WHERE owner_user_id = $1
        AND role_type = $2
      `,
      [ownerUserId, type],
    );

    await pool.query('COMMIT');

    if (!updated.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      key: updated.rows[0][keyColumn],
      rotatedType: type,
      message: `Your ${type} key was rotated. Connected ${type} sessions were signed out.`,
    });
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid rotate payload.' });
    }
    console.error('[SUPPORT_KEYS] rotate_error', error);
    return res.status(500).json({ error: 'Could not rotate key.' });
  }
});

app.get('/api/support/therapist-note', async (req, res) => {
  const { ownerUserId } = getAuthContext(req);

  const noteRes = await pool.query(
    `
    SELECT tn.message_text, tn.companion_instruction, tn.created_at,
           u.full_name AS therapist_name
    FROM therapist_notes tn
    LEFT JOIN users u ON u.id = tn.therapist_user_id
    WHERE tn.owner_user_id = $1
    ORDER BY tn.created_at DESC
    LIMIT 1
    `,
    [ownerUserId],
  );

  return res.json({ note: noteRes.rows[0] || null });
});

app.post('/api/support/therapist-note', async (req, res) => {
  if (!requireTherapistRole(req, res)) return;
  const { actorUserId, ownerUserId } = getAuthContext(req);

  try {
    const input = therapistNoteSchema.parse(req.body);

    const inserted = await pool.query(
      `
      INSERT INTO therapist_notes (owner_user_id, therapist_user_id, message_text, companion_instruction, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, message_text, companion_instruction, created_at
      `,
      [ownerUserId, actorUserId, input.message, input.companionInstruction],
    );

    if (input.companionInstruction) {
      await pool.query(
        `
        UPDATE companions
        SET therapist_instructions = $1,
            updated_at = NOW()
        WHERE user_id = $2
        `,
        [input.companionInstruction, ownerUserId],
      );
    }

    return res.json({ note: inserted.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid therapist note payload.' });
    }
    console.error('[THERAPIST_NOTE] save_error', error);
    return res.status(500).json({ error: 'Could not save therapist note.' });
  }
});

const onboardingSchema = z.object({
  fullName: z.string().min(2).max(80),
  age: z.number().int().min(13).max(100).optional(),
  babyAgeWeeks: z.number().int().min(0).max(260).optional(),
  seeingDoctor: z.boolean().optional(),
  companionAvatarId: z.string().min(2).max(50).optional().default(''),
  companionVoiceName: z.enum(GEMINI_VOICE_IDS).optional().default(DEFAULT_GEMINI_VOICE),
  companionName: z.string().min(2).max(60),
  companionInstructions: z.string().max(1000).optional().default(''),
  assessment: z
    .object({
      primaryGoal: z.enum(['reduce_stress', 'emotional_support', 'build_routine', 'cope_with_anxiety', 'just_exploring']).optional(),
      babyAgeWeeks: z.number().int().min(0).max(260).optional(),
      sleepQuality: z.enum(['good', 'okay', 'poor', 'very_poor']).optional(),
      moodFrequency: z.enum(['not_at_all', 'several_days', 'more_than_half', 'nearly_every_day']).optional(),
      anxietyFrequency: z.enum(['not_at_all', 'several_days', 'more_than_half', 'nearly_every_day']).optional(),
      priorDepression: z.boolean().optional(),
      priorProfessionalHelp: z.boolean().optional(),
      supportLevel: z.enum(['strong', 'some', 'limited', 'none']).optional(),
      physicalDistress: z.enum(['none', 'mild', 'moderate', 'severe']).optional(),
      stressfulEvents: z.boolean().optional(),
      safetyConcern: z.enum(['none', 'passive', 'active']).optional(),
    })
    .optional(),
});

const companionUpdateSchema = z.object({
  companionAvatarId: z.string().min(2).max(50).optional().default(''),
  companionVoiceName: z.enum(GEMINI_VOICE_IDS).optional().default(DEFAULT_GEMINI_VOICE),
  companionName: z.string().min(2).max(60),
  companionInstructions: z.string().max(1000).optional().default(''),
});

const defaultDashboardRoleSchema = z.object({
  role: z.enum(['mom', 'therapist', 'trusted']),
});

const geminiVoicePreviewSchema = z.object({
  text: z.string().min(1).max(160),
  voiceName: z.enum(GEMINI_VOICE_IDS),
});

function getRiskBand(assessment = {}) {
  let score = 0;
  if (assessment.moodFrequency === 'more_than_half') score += 2;
  if (assessment.moodFrequency === 'nearly_every_day') score += 3;
  if (assessment.anxietyFrequency === 'more_than_half') score += 2;
  if (assessment.anxietyFrequency === 'nearly_every_day') score += 3;
  if (assessment.sleepQuality === 'poor') score += 1;
  if (assessment.sleepQuality === 'very_poor') score += 2;
  if (assessment.supportLevel === 'limited') score += 1;
  if (assessment.supportLevel === 'none') score += 2;
  if (assessment.physicalDistress === 'moderate') score += 1;
  if (assessment.physicalDistress === 'severe') score += 2;
  if (assessment.priorDepression) score += 2;
  if (assessment.stressfulEvents) score += 1;
  if (assessment.safetyConcern === 'passive') score += 4;
  if (assessment.safetyConcern === 'active') score += 8;

  if (score >= 10) return 'high';
  if (score >= 5) return 'moderate';
  return 'low';
}

function buildCompanionInstructions(baseInstructions = '', assessment = {}) {
  const lines = [];
  const riskBand = getRiskBand(assessment);

  const goalMap = {
    reduce_stress: 'reduce stress and feel calmer',
    emotional_support: 'feel emotionally supported',
    build_routine: 'build stable daily routines',
    cope_with_anxiety: 'cope with anxiety and overthinking',
    just_exploring: 'explore support gently',
  };

  if (assessment.primaryGoal) {
    lines.push(`Onboarding goal: ${goalMap[assessment.primaryGoal] || 'general postpartum support'}.`);
  }
  lines.push(`Baby age: about ${assessment.babyAgeWeeks ?? 'unknown'} weeks postpartum.`);
  lines.push(`Current risk band from intake (non-diagnostic): ${riskBand}.`);

  if (assessment.sleepQuality === 'poor' || assessment.sleepQuality === 'very_poor') {
    lines.push('Prioritize tiny, realistic rest and recovery check-ins.');
  }
  if (assessment.supportLevel === 'limited' || assessment.supportLevel === 'none') {
    lines.push('User may have limited support network; offer concrete prompts to reach one trusted person.');
  }
  if (assessment.physicalDistress === 'moderate' || assessment.physicalDistress === 'severe') {
    lines.push('Acknowledge physical recovery stress and suggest contacting clinician for persistent pain.');
  }
  if (assessment.safetyConcern === 'passive' || assessment.safetyConcern === 'active') {
    lines.push('Safety risk noted. If self-harm or harm-to-baby content appears, stop normal flow and strongly direct to immediate human help and emergency services.');
  }

  if (baseInstructions && baseInstructions.trim()) {
    lines.push(`User custom preferences: ${baseInstructions.trim()}`);
  }

  return lines.join(' ');
}

async function addConnection(ownerUserId, rawKey, connectionType, { strict = true } = {}) {
  if (!rawKey) {
    return { connected: false, reason: 'empty' };
  }

  const key = rawKey.trim().toUpperCase();
  if (!key) {
    return { connected: false, reason: 'empty' };
  }

  const keyColumn = connectionType === 'therapist' ? 'therapist_share_key' : 'trusted_share_key';
  const target = await pool.query(`SELECT id FROM users WHERE ${keyColumn} = $1 OR share_key = $1`, [key]);
  if (!target.rows.length) {
    if (strict) {
      throw new Error(`No user found for ${connectionType} key: ${key}`);
    }
    console.warn(`[CONNECTIONS] skipped_missing_key owner=${ownerUserId} type=${connectionType} key=${key}`);
    return { connected: false, reason: 'not_found' };
  }

  const targetId = target.rows[0].id;

  if (targetId === ownerUserId) {
    if (strict) {
      throw new Error(`You cannot connect your own ${connectionType} key.`);
    }
    console.warn(`[CONNECTIONS] skipped_self_key owner=${ownerUserId} type=${connectionType} key=${key}`);
    return { connected: false, reason: 'self' };
  }

  await pool.query(
    `
    INSERT INTO connections (owner_user_id, target_user_id, connection_type)
    VALUES ($1, $2, $3)
    ON CONFLICT (owner_user_id, target_user_id, connection_type) DO NOTHING
    `,
    [ownerUserId, targetId, connectionType],
  );
  return { connected: true };
}

app.put('/api/me/onboarding', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);

  try {
    console.log(`[ONBOARDING] start userId=${userId}`);
    const input = onboardingSchema.parse(req.body);

    await pool.query('BEGIN');

    const finalCompanionInstructions = buildCompanionInstructions(input.companionInstructions, input.assessment || {});

    const adkAgent = await createGoogleAdkCompanion({
      userId,
      companionName: input.companionName,
      companionInstructions: finalCompanionInstructions,
    });

    // Update user record
    await pool.query(
      `
      UPDATE users
      SET
        full_name = $1,
        companion_name = $2,
        companion_instructions = $3,
        companion_avatar_id = $4,
        companion_voice_name = $5,
        onboarding_completed = TRUE,
        companion_agent_id = $6,
        companion_session_id = $7,
        onboarding_assessment = $8,
        updated_at = NOW()
      WHERE id = $9
      `,
      [
        input.fullName.trim(),
        input.companionName.trim(),
        finalCompanionInstructions,
        input.companionAvatarId || null,
        input.companionVoiceName || null,
        adkAgent.agentId,
        adkAgent.sessionId,
        input.assessment || {},
        userId,
      ],
    );

    // Upsert companion record
    await pool.query(
      `
      INSERT INTO companions (user_id, name, user_instructions, base_prompt, avatar_id, voice_name, agent_id, session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name,
        user_instructions = EXCLUDED.user_instructions,
        base_prompt = EXCLUDED.base_prompt,
        avatar_id = EXCLUDED.avatar_id,
        voice_name = EXCLUDED.voice_name,
        agent_id = EXCLUDED.agent_id,
        session_id = EXCLUDED.session_id,
        updated_at = NOW()
      `,
      [
        userId,
        input.companionName.trim(),
        input.companionInstructions || '',
        finalCompanionInstructions,
        input.companionAvatarId || null,
        input.companionVoiceName || null,
        adkAgent.agentId,
        adkAgent.sessionId,
      ],
    );

    await pool.query('COMMIT');
    console.log(`[ONBOARDING] committed userId=${userId}`);

    const userRes = await pool.query(
      `
      SELECT id, email, full_name, avatar_url, onboarding_completed, companion_name, companion_instructions, companion_agent_id, companion_session_id, companion_avatar_id, companion_voice_name, share_key, therapist_share_key, trusted_share_key, preferred_dashboard_role, onboarding_assessment
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    return res.json({ user: userRes.rows[0], adkAgent });
  } catch (error) {
    console.error(`[ONBOARDING] error userId=${userId}`, error);
    await pool.query('ROLLBACK');

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid onboarding payload.' });
    }

    return res.status(400).json({ error: error.message || 'Failed to complete onboarding.' });
  }
});

app.put('/api/me/default-dashboard', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);

  try {
    const { role } = defaultDashboardRoleSchema.parse(req.body);
    const result = await pool.query(
      `
      UPDATE users
      SET preferred_dashboard_role = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, full_name, avatar_url, onboarding_completed, companion_name, companion_instructions, companion_agent_id, companion_session_id, companion_avatar_id, companion_voice_name, share_key, therapist_share_key, trusted_share_key, preferred_dashboard_role, onboarding_assessment
      `,
      [role, userId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid dashboard role.' });
    }
    return res.status(500).json({ error: 'Failed to update dashboard role.' });
  }
});

app.put('/api/me/companion', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);

  try {
    const input = companionUpdateSchema.parse(req.body);
    const currentRes = await pool.query(
      `
      SELECT onboarding_assessment, companion_agent_id, companion_session_id
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    if (!currentRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const currentUser = currentRes.rows[0];
    const finalCompanionInstructions = buildCompanionInstructions(
      input.companionInstructions,
      currentUser.onboarding_assessment || {},
    );

    await pool.query('BEGIN');

    await pool.query(
      `
      UPDATE users
      SET
        companion_name = $1,
        companion_instructions = $2,
        companion_avatar_id = $3,
        companion_voice_name = $4,
        updated_at = NOW()
      WHERE id = $5
      `,
      [
        input.companionName.trim(),
        finalCompanionInstructions,
        input.companionAvatarId || null,
        input.companionVoiceName || null,
        userId,
      ],
    );

    await pool.query(
      `
      INSERT INTO companions (user_id, name, user_instructions, base_prompt, avatar_id, voice_name, agent_id, session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name,
        user_instructions = EXCLUDED.user_instructions,
        base_prompt = EXCLUDED.base_prompt,
        avatar_id = EXCLUDED.avatar_id,
        voice_name = EXCLUDED.voice_name,
        updated_at = NOW()
      `,
      [
        userId,
        input.companionName.trim(),
        input.companionInstructions || '',
        finalCompanionInstructions,
        input.companionAvatarId || null,
        input.companionVoiceName || null,
        currentUser.companion_agent_id || null,
        currentUser.companion_session_id || null,
      ],
    );

    await pool.query('COMMIT');

    const result = await pool.query(
      `
      SELECT u.id, u.email, u.full_name, u.avatar_url, u.onboarding_completed,
             u.companion_name, u.companion_instructions, u.companion_agent_id,
             u.companion_avatar_id, u.companion_voice_name,
             u.share_key, u.therapist_share_key, u.trusted_share_key, u.created_at, u.companion_session_id,
             u.preferred_dashboard_role, u.onboarding_assessment,
             c.id AS companion_id, c.name AS comp_name,
             c.user_instructions AS comp_user_instructions,
             c.therapist_instructions AS comp_therapist_instructions,
             c.base_prompt AS comp_base_prompt, c.avatar_id AS comp_avatar_id,
             c.voice_name AS comp_voice_name,
             c.agent_id AS comp_agent_id, c.session_id AS comp_session_id
      FROM users u
      LEFT JOIN companions c ON c.user_id = u.id
      WHERE u.id = $1
      `,
      [userId],
    );

    const row = result.rows[0];
    const user = {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      onboarding_completed: row.onboarding_completed,
      companion_name: row.companion_name,
      companion_instructions: row.companion_instructions,
      companion_agent_id: row.companion_agent_id,
      companion_session_id: row.companion_session_id,
      companion_avatar_id: row.companion_avatar_id,
      companion_voice_name: row.companion_voice_name,
      share_key: row.share_key,
      therapist_share_key: row.therapist_share_key,
      trusted_share_key: row.trusted_share_key,
      created_at: row.created_at,
      preferred_dashboard_role: row.preferred_dashboard_role,
      onboarding_assessment: row.onboarding_assessment,
      companion: row.companion_id ? {
        id: row.companion_id,
        name: row.comp_name,
        user_instructions: row.comp_user_instructions,
        therapist_instructions: row.comp_therapist_instructions,
        base_prompt: row.comp_base_prompt,
        avatar_id: row.comp_avatar_id,
        voice_name: row.comp_voice_name,
        agent_id: row.comp_agent_id,
        session_id: row.comp_session_id,
      } : undefined,
    };

    return res.json({ user });
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid companion update payload.' });
    }
    console.error('[COMPANION] update_error', error);
    return res.status(500).json({ error: 'Failed to update companion.' });
  }
});

const companionChatSchema = z.object({
  message: z.string().min(1).max(1500),
});

app.post('/api/companion/chat', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);

  try {
    console.log(`[COMPANION] chat_start userId=${userId}`);
    const { message } = companionChatSchema.parse(req.body);

    // Try companions table first, fall back to users table
    let companion = null;
    const compRes = await pool.query(
      `SELECT name, user_instructions, therapist_instructions, base_prompt, session_id FROM companions WHERE user_id = $1`,
      [userId],
    );
    if (compRes.rows.length) {
      companion = compRes.rows[0];
    } else {
      const userRes = await pool.query(
        `SELECT companion_name AS name, companion_instructions AS base_prompt, companion_session_id AS session_id FROM users WHERE id = $1`,
        [userId],
      );
      companion = userRes.rows[0];
    }

    if (!companion?.name) {
      return res.status(400).json({ error: 'Companion not configured yet. Complete onboarding first.' });
    }

    // Merge therapist instructions into the base prompt if present
    let instructions = companion.base_prompt || '';
    if (companion.therapist_instructions) {
      instructions += `\nTherapist guidance: ${companion.therapist_instructions}`;
    }

    const response = await runCompanionTurn({
      userId,
      companionName: companion.name,
      companionInstructions: instructions,
      sessionId: companion.session_id || undefined,
      message,
    });

    if (response.sessionId !== companion.session_id) {
      // Update session ID in both tables
      await pool.query(
        `UPDATE companions SET session_id = $1, updated_at = NOW() WHERE user_id = $2`,
        [response.sessionId, userId],
      );
      await pool.query(
        `UPDATE users SET companion_session_id = $1, updated_at = NOW() WHERE id = $2`,
        [response.sessionId, userId],
      );
    }

    return res.json({
      reply: response.responseText,
      sessionId: response.sessionId,
      agentId: response.agentName,
    });
  } catch (error) {
    console.error(`[COMPANION] chat_error userId=${userId}`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid chat payload.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Companion chat failed.' });
  }
});

app.get('/api/gemini/voices', (_req, res) => {
  return res.json({ voices: GEMINI_VOICE_OPTIONS });
});

app.post('/api/gemini/voice-preview', async (req, res) => {
  try {
    const { text, voiceName } = geminiVoicePreviewSchema.parse(req.body);
    const { audioBuffer, mimeType } = await synthesizePreviewSpeech({ text, voiceName });
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audioBuffer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid Gemini voice preview payload.' });
    }
    console.error('[GEMINI_VOICE_PREVIEW] error', error);
    return res.status(500).json({ error: error.message || 'Gemini voice preview failed.' });
  }
});

const connectSchema = z.object({
  key: z.string().min(4).max(16),
  type: z.enum(['therapist', 'trusted']),
});

app.post('/api/connections/connect', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);

  try {
    console.log(`[CONNECTIONS] connect_start userId=${userId}`);
    const input = connectSchema.parse(req.body);
    await addConnection(userId, input.key, input.type);
    console.log(`[CONNECTIONS] connect_ok userId=${userId} type=${input.type}`);
    return res.json({ ok: true });
  } catch (error) {
    console.error(`[CONNECTIONS] connect_error userId=${userId}`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid connection payload.' });
    }
    return res.status(400).json({ error: error.message || 'Failed to connect.' });
  }
});

app.get('/api/connections/overview', async (req, res) => {
  const { actorUserId: userId } = getAuthContext(req);
  console.log(`[CONNECTIONS] overview_start userId=${userId}`);

  const [myTherapists, myTrustedPeople, myPatients, peopleThatTrustMe] = await Promise.all([
    pool.query(
      `
      SELECT c.id, u.id AS user_id, u.full_name, u.email, u.avatar_url
      FROM connections c
      JOIN users u ON u.id = c.target_user_id
      WHERE c.owner_user_id = $1 AND c.connection_type = 'therapist'
      ORDER BY c.created_at DESC
      `,
      [userId],
    ),
    pool.query(
      `
      SELECT c.id, u.id AS user_id, u.full_name, u.email, u.avatar_url
      FROM connections c
      JOIN users u ON u.id = c.target_user_id
      WHERE c.owner_user_id = $1 AND c.connection_type = 'trusted'
      ORDER BY c.created_at DESC
      `,
      [userId],
    ),
    pool.query(
      `
      SELECT c.id, u.id AS user_id, u.full_name, u.email, u.avatar_url
      FROM connections c
      JOIN users u ON u.id = c.owner_user_id
      WHERE c.target_user_id = $1 AND c.connection_type = 'therapist'
      ORDER BY c.created_at DESC
      `,
      [userId],
    ),
    pool.query(
      `
      SELECT c.id, u.id AS user_id, u.full_name, u.email, u.avatar_url
      FROM connections c
      JOIN users u ON u.id = c.owner_user_id
      WHERE c.target_user_id = $1 AND c.connection_type = 'trusted'
      ORDER BY c.created_at DESC
      `,
      [userId],
    ),
  ]);

  return res.json({
    myTherapists: myTherapists.rows,
    myTrustedPeople: myTrustedPeople.rows,
    myPatients: myPatients.rows,
    peopleThatTrustMe: peopleThatTrustMe.rows,
  });
});

/* ─────────────────────────────────────────────
   Call session & transcript analytics endpoints
   ───────────────────────────────────────────── */

const callStartSchema = z.object({
  callType: z.enum(['voice', 'video']),
});

const callMessagesSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(200),
});

const callEndSchema = z.object({});
const dashboardQuerySchema = z.object({
  timeZone: z.string().min(3).max(100).optional(),
});
const moodPointsQuerySchema = z.object({
  timeZone: z.string().min(3).max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /api/calls/start — create a call session record
app.post('/api/calls/start', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);
  try {
    const { callType } = callStartSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO call_sessions (user_id, call_type) VALUES ($1, $2) RETURNING id`,
      [userId, callType],
    );
    return res.json({ callId: result.rows[0].id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message });
    }
    console.error('[CALLS] start_error', error);
    return res.status(500).json({ error: 'Failed to start call session.' });
  }
});

// POST /api/calls/:callId/messages — bulk save transcript messages
app.post('/api/calls/:callId/messages', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);
  const { callId } = req.params;
  try {
    const { messages } = callMessagesSchema.parse(req.body);

    // Verify ownership
    const sessionRes = await pool.query(
      'SELECT id FROM call_sessions WHERE id = $1 AND user_id = $2',
      [callId, userId],
    );
    if (!sessionRes.rows.length) {
      return res.status(404).json({ error: 'Call session not found.' });
    }

    if (messages.length > 0) {
      // Build parameterized bulk insert
      const values = [];
      const placeholders = messages
        .map((m, i) => {
          values.push(callId, m.role, m.content);
          const base = i * 3 + 1;
          return `($${base}, $${base + 1}, $${base + 2})`;
        })
        .join(', ');
      await pool.query(
        `INSERT INTO call_messages (call_session_id, role, content) VALUES ${placeholders}`,
        values,
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message });
    }
    console.error('[CALLS] messages_error', error);
    return res.status(500).json({ error: 'Failed to save messages.' });
  }
});

// PUT /api/calls/:callId/end — mark call as ended
app.put('/api/calls/:callId/end', async (req, res) => {
  if (!requireMomRole(req, res)) return;
  const { ownerUserId: userId } = getAuthContext(req);
  const { callId } = req.params;
  try {
    callEndSchema.parse(req.body || {});

    const result = await pool.query(
      `UPDATE call_sessions
       SET ended_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [callId, userId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Call session not found.' });
    }

    let analysis = null;
    try {
      analysis = await analyzeCallSession({ callId, userId });
    } catch (analysisError) {
      console.error('[CALLS] analysis_error', analysisError);
    }

    // Fire-and-forget: extract and store a personal insight from this call
    recordCallMemory({ callId, userId }).catch((memErr) => {
      console.error('[CALLS] memory_error', memErr);
    });

    return res.json({ ok: true, analysisReady: Boolean(analysis) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message });
    }
    console.error('[CALLS] end_error', error);
    return res.status(500).json({ error: 'Failed to end call session.' });
  }
});

app.get('/api/dashboard/insights', async (req, res) => {
  const { authRole, ownerUserId } = getAuthContext(req);

  try {
    const { timeZone } = dashboardQuerySchema.parse(req.query || {});
    const requestedRole = authRole || 'mom';

    const data = await getDashboardInsights({
      userId: ownerUserId,
      role: requestedRole,
      timeZone,
    });

    return res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid dashboard query.' });
    }
    console.error('[DASHBOARD] insights_error', error);
    return res.status(500).json({ error: 'Failed to load dashboard insights.' });
  }
});

app.get('/api/dashboard/quick-tips', async (req, res) => {
  const { ownerUserId: userId } = getAuthContext(req);

  try {
    const { timeZone } = dashboardQuerySchema.parse(req.query || {});
    const data = await getContextualQuickTips({ userId, timeZone });
    return res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid quick tips query.' });
    }
    console.error('[DASHBOARD] quick_tips_error', error);
    return res.status(500).json({ error: 'Failed to load quick tips.' });
  }
});

app.get('/api/dashboard/day-points', async (req, res) => {
  const { ownerUserId: userId } = getAuthContext(req);

  try {
    const { timeZone, date } = moodPointsQuerySchema.parse(req.query || {});
    const data = await getMoodPointSeries({ userId, timeZone, date });
    return res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid day points query.' });
    }
    console.error('[DASHBOARD] day_points_error', error);
    return res.status(500).json({ error: 'Failed to load daily mood points.' });
  }
});

/* ─────────────────────────────────────────────
   Mom Tips — community wisdom from other moms
   ───────────────────────────────────────────── */

const momTipSchema = z.object({
  tip: z.string().min(3).max(500),
});

let momTipsTableReady = false;
let momTipsTablePromise = null;

async function ensureMomTipsTable() {
  if (momTipsTableReady) return;
  if (!momTipsTablePromise) {
    momTipsTablePromise = pool
      .query(`
        DO $$
        DECLARE
          user_id_data_type TEXT;
        BEGIN
          CREATE TABLE IF NOT EXISTS mom_tips (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tip TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          SELECT data_type
          INTO user_id_data_type
          FROM information_schema.columns
          WHERE table_name = 'mom_tips'
            AND column_name = 'user_id'
          LIMIT 1;

          IF user_id_data_type IS NOT NULL AND user_id_data_type <> 'uuid' THEN
            ALTER TABLE mom_tips DROP CONSTRAINT IF EXISTS mom_tips_user_id_fkey;
            ALTER TABLE mom_tips
              ALTER COLUMN user_id TYPE UUID
              USING user_id::text::uuid;
            ALTER TABLE mom_tips
              ADD CONSTRAINT mom_tips_user_id_fkey
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
        END $$;
      `)
      .then(() => {
        momTipsTableReady = true;
        console.log('[DB] mom_tips table ready');
      })
      .catch((err) => {
        momTipsTablePromise = null;
        console.error('[DB] mom_tips table creation failed', err.message);
        throw err;
      });
  }
  await momTipsTablePromise;
}

ensureMomTipsTable().catch(() => {});

app.post('/api/mom-tips', async (req, res) => {
  const { ownerUserId: userId } = getAuthContext(req);
  try {
    await ensureMomTipsTable();
    const { tip } = momTipSchema.parse(req.body);
    await pool.query(
      'INSERT INTO mom_tips (user_id, tip) VALUES ($1, $2)',
      [userId, tip.trim()],
    );
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message });
    }
    console.error('[MOM_TIPS] submit_error', error);
    return res.status(500).json({ error: 'Failed to save tip.' });
  }
});

app.get('/api/mom-tips/random', async (req, res) => {
  const { ownerUserId: userId } = getAuthContext(req);
  try {
    await ensureMomTipsTable();
    const result = await pool.query(
      `SELECT mt.tip, COALESCE(NULLIF(TRIM(u.full_name), ''), 'A fellow mom') AS full_name
       FROM mom_tips mt
       LEFT JOIN users u ON u.id = mt.user_id
       WHERE mt.user_id != $1
       ORDER BY RANDOM()
       LIMIT 5`,
      [userId],
    );
    return res.json({ tips: result.rows });
  } catch (error) {
    console.error('[MOM_TIPS] random_error', error);
    // Community notes are optional dashboard content, so degrade gracefully.
    return res.json({
      tips: [],
      degraded: true,
    });
  }
});

/* ─────────────────────────────────────────────
   Profile update (for therapist/trusted name entry)
   ───────────────────────────────────────────── */

app.put('/api/me/profile', async (req, res) => {
  const { actorUserId } = getAuthContext(req);
  try {
    const { fullName } = profileUpdateSchema.parse(req.body);
    await pool.query(
      `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`,
      [fullName.trim(), actorUserId],
    );
    return res.json({ ok: true, fullName: fullName.trim() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid name.' });
    }
    console.error('[PROFILE] update_error', error);
    return res.status(500).json({ error: 'Could not update profile.' });
  }
});

/* ─────────────────────────────────────────────
   Multi-client: switch client for support roles
   ───────────────────────────────────────────── */

app.post('/api/auth/switch-client', async (req, res) => {
  const { authRole, actorUserId } = getAuthContext(req);
  if (authRole === 'mom') {
    return res.status(403).json({ error: 'Client switching is only for therapist or trusted roles.' });
  }

  try {
    const { targetUserId } = switchClientSchema.parse(req.body);

    const linkRes = await pool.query(
      `SELECT id FROM support_role_links
       WHERE support_user_id = $1 AND owner_user_id = $2 AND role_type = $3`,
      [actorUserId, targetUserId, authRole],
    );

    if (!linkRes.rows.length) {
      return res.status(403).json({ error: 'You are not connected to this client.' });
    }

    const ownerRes = await pool.query(
      `SELECT id, full_name, email, avatar_url, onboarding_completed,
              companion_name, companion_instructions, companion_agent_id,
              companion_avatar_id, companion_voice_name,
              share_key, therapist_share_key, trusted_share_key, created_at, companion_session_id,
              preferred_dashboard_role, onboarding_assessment
       FROM users WHERE id = $1`,
      [targetUserId],
    );

    if (!ownerRes.rows.length) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const owner = ownerRes.rows[0];
    const actorRes = await pool.query(`SELECT full_name, email FROM users WHERE id = $1`, [actorUserId]);

    const accessToken = jwt.sign(
      {
        userId: actorUserId,
        email: actorRes.rows[0]?.email || '',
        authRole,
        targetUserId: owner.id,
        linkId: linkRes.rows[0].id,
      },
      config.jwtSecret,
      { expiresIn: '7d' },
    );

    return res.json({
      accessToken,
      user: {
        ...owner,
        auth_role: authRole,
        support_user_name: actorRes.rows[0]?.full_name || '',
        support_user_email: actorRes.rows[0]?.email || '',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid payload.' });
    }
    console.error('[AUTH] switch_client_error', error);
    return res.status(500).json({ error: 'Could not switch client.' });
  }
});

/* ─────────────────────────────────────────────
   Multi-client: list connected clients
   ───────────────────────────────────────────── */

app.get('/api/me/clients', async (req, res) => {
  const { authRole, actorUserId } = getAuthContext(req);
  if (authRole === 'mom') {
    return res.status(403).json({ error: 'Client listing is only for therapist or trusted roles.' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url, u.onboarding_completed,
              srl.created_at AS connected_at,
              (SELECT MAX(cs.ended_at) FROM call_sessions cs WHERE cs.user_id = u.id) AS last_activity
       FROM support_role_links srl
       JOIN users u ON u.id = srl.owner_user_id
       WHERE srl.support_user_id = $1 AND srl.role_type = $2
       ORDER BY srl.updated_at DESC`,
      [actorUserId, authRole],
    );

    return res.json({ clients: result.rows });
  } catch (error) {
    console.error('[CLIENTS] list_error', error);
    return res.status(500).json({ error: 'Could not load clients.' });
  }
});

/* ─────────────────────────────────────────────
   Multi-client: add a new client via key
   ───────────────────────────────────────────── */

app.post('/api/me/clients/add', async (req, res) => {
  const { authRole, actorUserId } = getAuthContext(req);
  if (authRole === 'mom') {
    return res.status(403).json({ error: 'Adding clients is only for therapist or trusted roles.' });
  }

  try {
    const { key } = addClientKeySchema.parse(req.body);
    const normalizedKey = normalizeKey(key);
    const keyColumn = authRole === 'therapist' ? 'therapist_share_key' : 'trusted_share_key';

    const ownerRes = await pool.query(
      `SELECT id, full_name, email, avatar_url, onboarding_completed
       FROM users WHERE ${keyColumn} = $1`,
      [normalizedKey],
    );

    if (!ownerRes.rows.length) {
      return res.status(400).json({ error: 'No mom found with that key. Please check the code and try again.' });
    }

    const owner = ownerRes.rows[0];
    if (owner.id === actorUserId) {
      return res.status(400).json({ error: 'You cannot add yourself as a client.' });
    }
    if (!owner.onboarding_completed) {
      return res.status(400).json({ error: 'This key belongs to an account that has not completed setup yet.' });
    }

    await pool.query(
      `INSERT INTO support_role_links (owner_user_id, support_user_id, role_type, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (owner_user_id, support_user_id, role_type)
       DO UPDATE SET updated_at = NOW()`,
      [owner.id, actorUserId, authRole],
    );

    return res.json({
      ok: true,
      client: {
        id: owner.id,
        full_name: owner.full_name,
        email: owner.email,
        avatar_url: owner.avatar_url,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid key.' });
    }
    console.error('[CLIENTS] add_error', error);
    return res.status(500).json({ error: 'Could not add client.' });
  }
});

/* ─────────────────────────────────────────────
   Trusted person notes (messages to the mom)
   ───────────────────────────────────────────── */

function requireTrustedRole(req, res) {
  const { authRole } = getAuthContext(req);
  if (authRole !== 'trusted') {
    res.status(403).json({ error: 'This action is only available in Trusted Person mode.' });
    return false;
  }
  return true;
}

app.get('/api/support/trusted-note', async (req, res) => {
  const { ownerUserId } = getAuthContext(req);
  const noteRes = await pool.query(
    `SELECT tn.message_text, tn.created_at,
            u.full_name AS trusted_name
     FROM trusted_notes tn
     LEFT JOIN users u ON u.id = tn.trusted_user_id
     WHERE tn.owner_user_id = $1
     ORDER BY tn.created_at DESC
     LIMIT 1`,
    [ownerUserId],
  );
  return res.json({ note: noteRes.rows[0] || null });
});

app.post('/api/support/trusted-note', async (req, res) => {
  if (!requireTrustedRole(req, res)) return;
  const { actorUserId, ownerUserId } = getAuthContext(req);

  try {
    const input = trustedNoteSchema.parse(req.body);
    const inserted = await pool.query(
      `INSERT INTO trusted_notes (owner_user_id, trusted_user_id, message_text, updated_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, message_text, created_at`,
      [ownerUserId, actorUserId, input.message.trim()],
    );
    return res.json({ note: inserted.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Invalid message.' });
    }
    console.error('[TRUSTED_NOTE] save_error', error);
    return res.status(500).json({ error: 'Could not save message.' });
  }
});

/* ─────────────────────────────────────────────
   AI-generated recommendations for trusted person
   ───────────────────────────────────────────── */

app.get('/api/support/trusted-recommendations', async (req, res) => {
  if (!requireTrustedRole(req, res)) return;
  const { ownerUserId } = getAuthContext(req);

  try {
    const userRes = await pool.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [ownerUserId],
    );
    const momName = userRes.rows[0]?.full_name || 'the mom';

    const analysesRes = await pool.query(
      `SELECT csa.analysis_json
       FROM call_session_analyses csa
       JOIN call_sessions cs ON cs.id = csa.call_session_id
       WHERE csa.user_id = $1
       ORDER BY cs.ended_at DESC NULLS LAST
       LIMIT 5`,
      [ownerUserId],
    );

    const analyses = analysesRes.rows
      .map((row) => row.analysis_json)
      .filter(Boolean);

    if (!analyses.length) {
      return res.json({
        recommendations: [
          `Check in with ${momName} today and ask how she is really feeling.`,
          'Offer to take care of one specific task so she can rest.',
          'Remind her that asking for help is a sign of strength, not weakness.',
          'Spend a few quiet minutes together without any agenda.',
          'Let her know you are there for her, no matter what.',
        ],
      });
    }

    const latestScores = analyses[0]?.signalScores || {};
    const latestThemes = analyses[0]?.themes || {};
    const trustedView = analyses[0]?.trustedPersonView || {};

    const recommendations = [];

    if ((latestScores.sleepQuality || 50) <= 40) {
      recommendations.push(`${momName}'s sleep has been really thin lately. Offer to handle a night feed or morning duty so she can get uninterrupted rest.`);
    }
    if ((latestScores.stressLoad || 50) >= 65) {
      recommendations.push(`She seems to be under significant stress. Take one thing off her plate today, like cooking, cleaning, or errands.`);
    }
    if ((latestScores.energyLevel || 50) <= 40) {
      recommendations.push(`Her energy is running low. Bring her a meal, a snack, or a warm drink without asking. Small acts go a long way.`);
    }
    if ((latestScores.supportConnection || 50) <= 40) {
      recommendations.push(`She may be feeling isolated. Sit with her for a bit today, even in silence. Your presence matters.`);
    }
    if ((latestScores.moodBalance || 50) <= 40) {
      recommendations.push(`Her mood has been strained. Be gentle, avoid giving advice unless asked, and just listen.`);
    }

    if (trustedView.suggestedActions?.length) {
      trustedView.suggestedActions.slice(0, 2).forEach((action) => {
        if (action) recommendations.push(action);
      });
    }

    if (latestThemes.stressors?.length) {
      recommendations.push(`She has been stressed about ${latestThemes.stressors[0].toLowerCase()}. See if you can help with that specifically.`);
    }

    if (recommendations.length < 3) {
      recommendations.push(`Ask ${momName} what one thing would make her day easier, and do that one thing.`);
      recommendations.push(`Tell her something specific you admire about how she is handling things.`);
    }

    return res.json({
      recommendations: [...new Set(recommendations)].slice(0, 5),
    });
  } catch (error) {
    console.error('[TRUSTED_RECS] error', error);
    return res.json({
      recommendations: [
        'Check in with her today and ask how she is really doing.',
        'Offer to help with one specific task so she can take a break.',
        'Remind her that she is doing a great job, even on the hard days.',
      ],
    });
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(config.port, () => {
  console.log(`Backend API running on http://localhost:${config.port}`);
});
