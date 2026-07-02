process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/bloom_test';
process.env.APP_JWT_SECRET ||= 'test-secret';
process.env.GEMINI_API_KEY ||= 'test-gemini-key';

const assert = require('node:assert/strict');
const test = require('node:test');
const { _private } = require('./config');

test('Google client id is optional outside production', () => {
  assert.equal(_private.googleClientId({ NODE_ENV: 'development' }), '');
  assert.equal(_private.googleClientId({ NODE_ENV: 'test' }), '');
  assert.equal(_private.googleClientId({}), '');
});

test('Google client id is required in production', () => {
  assert.throws(
    () => _private.googleClientId({ NODE_ENV: 'production' }),
    /Missing required environment variable: GOOGLE_CLIENT_ID/,
  );
});

test('Google client id is returned when configured', () => {
  assert.equal(
    _private.googleClientId({
      NODE_ENV: 'production',
      GOOGLE_CLIENT_ID: 'real-client-id.apps.googleusercontent.com',
    }),
    'real-client-id.apps.googleusercontent.com',
  );
});
