import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { endCallAndNavigateImmediately } from './callNavigation.js';

import { PENDING_CALL_ID_KEY, PENDING_REFLECTION_KEY } from './dashboardReflectionSession.js';

describe('endCallAndNavigateImmediately', () => {
  it('navigates before waiting for async call finalization', async () => {
    const events = [];
    let resolveEndCall;
    const endCallPromise = new Promise((resolve) => {
      resolveEndCall = resolve;
    });

    const previousStorage = globalThis.sessionStorage;
    const storage = new Map();
    globalThis.sessionStorage = {
      setItem: (key, value) => storage.set(key, value),
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    };

    try {
      endCallAndNavigateImmediately({
        endCall: () => {
          events.push('endCall started');
          return endCallPromise;
        },
        clearDashboardCache: () => events.push('cache cleared'),
        navigate: (path, options) => events.push(['navigate', path, options]),
        to: '/dashboard',
      });

      assert.deepEqual(events, [
        'cache cleared',
        ['navigate', '/dashboard', { replace: true }],
      ]);
      assert.ok(storage.has(PENDING_REFLECTION_KEY));

      await Promise.resolve();

      assert.deepEqual(events, [
        'cache cleared',
        ['navigate', '/dashboard', { replace: true }],
        'endCall started',
      ]);
    } finally {
      globalThis.sessionStorage = previousStorage;
    }

    resolveEndCall('call-123');
    await endCallPromise;
  });

  it('stores the pending call id after finalization resolves', async () => {
    const previousStorage = globalThis.sessionStorage;
    const storage = new Map();
    globalThis.sessionStorage = {
      setItem: (key, value) => storage.set(key, value),
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    };

    try {
      endCallAndNavigateImmediately({
        endCall: async () => 'call-456',
        clearDashboardCache: () => {},
        navigate: () => {},
        to: '/dashboard',
      });

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(storage.get(PENDING_CALL_ID_KEY), 'call-456');
    } finally {
      globalThis.sessionStorage = previousStorage;
    }
  });
});
