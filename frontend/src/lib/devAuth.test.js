import assert from 'node:assert/strict';
import test from 'node:test';

import { requestDevAdminSession, shouldShowDevAdminLogin } from './devAuth.js';

test('dev admin login is visible only in Vite development mode', () => {
  assert.equal(shouldShowDevAdminLogin({ DEV: true }), true);
  assert.equal(shouldShowDevAdminLogin({ DEV: false }), false);
});

test('requestDevAdminSession posts to the dev admin auth endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        accessToken: 'dev-token',
        user: { id: 'dev-user', auth_role: 'mom' },
        actor: null,
      }),
    };
  };

  const session = await requestDevAdminSession({
    apiBaseUrl: 'http://localhost:8080',
    fetchImpl,
  });

  assert.deepEqual(session, {
    accessToken: 'dev-token',
    user: { id: 'dev-user', auth_role: 'mom' },
    actor: null,
  });
  assert.equal(calls[0].url, 'http://localhost:8080/api/auth/dev-admin');
  assert.equal(calls[0].options.method, 'POST');
});
