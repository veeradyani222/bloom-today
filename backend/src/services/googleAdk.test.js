process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/bloom_test';
process.env.GOOGLE_CLIENT_ID ||= 'test-google-client';
process.env.APP_JWT_SECRET ||= 'test-secret';
process.env.GEMINI_API_KEY ||= 'test-gemini-key';

const test = require('node:test');
const assert = require('node:assert/strict');

const { _private } = require('./googleAdk');

test('companion creation defaults to a free-tier friendly Gemini model', () => {
  assert.deepEqual(_private.getCompanionModelCandidates(), ['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
});

test('Gemini quota errors are retryable for companion model fallback', () => {
  const error = new Error('RESOURCE_EXHAUSTED');
  error.status = 429;

  assert.equal(_private.isRetryableGeminiError(error), true);
});

test('createGoogleAdkCompanion provisions a session without calling Gemini', async () => {
  const { createGoogleAdkCompanion } = require('./googleAdk');

  const result = await createGoogleAdkCompanion({
    userId: 'user-123',
    companionName: 'Luna',
    companionInstructions: 'Be gentle',
  });

  assert.equal(result.provider, 'google-genai');
  assert.match(result.agentId, /^companion-luna$/);
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(result.welcomeMessage, null);
});

