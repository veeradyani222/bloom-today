process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/bloom_test';
process.env.GOOGLE_CLIENT_ID ||= 'test-google-client';
process.env.APP_JWT_SECRET ||= 'test-secret';
process.env.GEMINI_API_KEY ||= 'test-gemini-key';
process.env.GEMINI_MODEL = 'gemini-2.5-pro';
delete process.env.GEMINI_ANALYSIS_MODEL;
delete process.env.GEMINI_ANALYSIS_FALLBACK_MODEL;
delete process.env.GEMINI_ANALYSIS_MODEL_ROTATION;

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

  assert.deepEqual(candidates, [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-2.5-pro',
    'gemini-pro-latest',
  ]);
});

test('Gemini model-not-found errors are retryable so fallback candidates can run', () => {
  const error = new Error('models/gemini-3-pro is not found for API version v1beta');
  error.status = 404;

  assert.equal(_private.isRetryableGeminiError(error), true);
});

test('dashboard hasData is true when completed calls exist before analysis', () => {
  assert.equal(_private.hasDashboardData({ analyses: [], activity: { totalCalls: 1 } }), true);
  assert.equal(_private.hasDashboardData({ analyses: [{ callId: 'call-1' }], activity: { totalCalls: 0 } }), true);
  assert.equal(_private.hasDashboardData({ analyses: [], activity: { totalCalls: 0 } }), false);
});

test('optional dashboard AI uses low-cost models without extra environment configuration', () => {
  assert.deepEqual(_private.getOptionalDashboardModelCandidates(), [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
  ]);
});

test('Gemini generation skips a quota-exhausted model on retry', async () => {
  _private.clearExhaustedGeminiModels();

  const attemptedModels = [];
  const response = await _private.generateGeminiContent({
    label: 'test-quota-skip',
    maxRetries: 2,
    modelCandidates: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    generateContent: async ({ model }) => {
      attemptedModels.push(model);
      if (model === 'gemini-2.5-flash-lite') {
        const error = new Error('RESOURCE_EXHAUSTED: quota exceeded');
        error.status = 429;
        throw error;
      }
      return { text: 'ok' };
    },
    waitFn: async () => {},
  });

  assert.equal(response.text, 'ok');
  assert.deepEqual(attemptedModels, ['gemini-2.5-flash-lite', 'gemini-2.5-flash']);

  await assert.rejects(
    () => _private.generateGeminiContent({
      label: 'test-quota-skip-again',
      maxRetries: 0,
      modelCandidates: ['gemini-2.5-flash-lite'],
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generateContent: async ({ model }) => {
        attemptedModels.push(model);
        return { text: 'unexpected' };
      },
      waitFn: async () => {},
    }),
    /All Gemini model candidates are marked as quota exhausted/,
  );

  assert.deepEqual(attemptedModels, ['gemini-2.5-flash-lite', 'gemini-2.5-flash']);

  _private.clearExhaustedGeminiModels();
});
