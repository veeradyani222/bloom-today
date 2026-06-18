process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/bloom_test';
process.env.GOOGLE_CLIENT_ID ||= 'test-google-client';
process.env.APP_JWT_SECRET ||= 'test-secret';
process.env.GEMINI_API_KEY ||= 'test-gemini-key';

const test = require('node:test');
const assert = require('node:assert/strict');

const { _private } = require('./dashboardInsights');

test('dashboard activity counts completed calls even when analysis is missing', () => {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

  const activity = _private.buildActivitySummary({
    analyses: [],
    callSessions: [
      { callType: 'voice', startedAt: twoDaysAgo, endedAt: twoDaysAgo },
      { callType: 'video', startedAt: oneHourAgo, endedAt: oneHourAgo },
    ],
    now,
  });

  assert.deepEqual(activity, {
    totalCalls: 2,
    callsToday: 1,
    callsThisWeek: 2,
    callsThisMonth: 2,
    lastCallAt: oneHourAgo,
  });
});

test('dashboard Gemini model candidates default to supported generateContent models', () => {
  const candidates = _private.getAnalysisModelCandidates();

  assert.deepEqual(candidates, ['gemini-2.5-pro', 'gemini-2.5-flash']);
});

test('Gemini model-not-found errors are retryable so fallback candidates can run', () => {
  const error = new Error('models/gemini-3-pro is not found for API version v1beta');
  error.status = 404;

  assert.equal(_private.isRetryableGeminiError(error), true);
});
