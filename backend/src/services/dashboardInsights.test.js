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
