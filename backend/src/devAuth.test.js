process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/bloom_test';
process.env.GOOGLE_CLIENT_ID ||= 'test-google-client';
process.env.APP_JWT_SECRET ||= 'test-secret';
process.env.GEMINI_API_KEY ||= 'test-gemini-key';

const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { buildDevAdminSession, isDevAdminAuthEnabled, upsertDevAdminUser } = require('./devAuth');

test('dev admin auth is disabled in production', () => {
  assert.equal(isDevAdminAuthEnabled('production'), false);
});

test('upsertDevAdminUser seeds a TalkingHead-compatible avatar and repairs unknown stored ids', async () => {
  const calls = [];
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'dev-admin@bloom.local',
    full_name: 'Dev Admin',
    companion_avatar_id: 'brunette',
  };
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [row] };
    },
  };

  const result = await upsertDevAdminUser(pool);

  assert.equal(result, row);
  assert.equal(calls[0].params[5], 'brunette');
  assert.match(
    calls[0].sql,
    /users\.companion_avatar_id = ANY\(\$11\)/,
  );
  assert.equal(calls[0].params[6], 'Aoede');
  assert.deepEqual(calls[0].params[10], ['brunette', 'mpfb', 'avaturn', 'avatarsdk']);
  assert.match(calls[0].sql, /users\.companion_voice_name = ANY\(\$12\)/);
  assert.ok(calls[0].params[11].includes('Aoede'));
});

test('dev admin auth is enabled outside production', () => {
  assert.equal(isDevAdminAuthEnabled('development'), true);
  assert.equal(isDevAdminAuthEnabled('test'), true);
  assert.equal(isDevAdminAuthEnabled(undefined), true);
});

test('buildDevAdminSession returns a normal mom session for the local dev admin', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'dev-admin@bloom.local',
    full_name: 'Dev Admin',
    avatar_url: null,
    onboarding_completed: true,
    companion_name: 'Luna',
    companion_instructions: 'Be warm and practical.',
    companion_agent_id: null,
    companion_session_id: null,
    companion_avatar_id: 'brunette',
    companion_voice_name: 'Aoede',
    share_key: 'DEVKEY',
    therapist_share_key: 'DEVTHER',
    trusted_share_key: 'DEVTRUST',
    preferred_dashboard_role: 'mom',
    onboarding_assessment: null,
  };

  const session = buildDevAdminSession(user, 'test-secret');
  const payload = jwt.verify(session.accessToken, 'test-secret');

  assert.equal(payload.userId, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.authRole, 'mom');
  assert.equal(session.actor, null);
  assert.deepEqual(session.user, { ...user, auth_role: 'mom', is_dev_admin: true });
});
