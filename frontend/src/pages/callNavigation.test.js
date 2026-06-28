import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { endCallAndNavigateImmediately } from './callNavigation.js';

describe('endCallAndNavigateImmediately', () => {
  it('navigates before waiting for async call finalization', async () => {
    const events = [];
    let resolveEndCall;
    const endCallPromise = new Promise((resolve) => {
      resolveEndCall = resolve;
    });

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

    await Promise.resolve();

    assert.deepEqual(events, [
      'cache cleared',
      ['navigate', '/dashboard', { replace: true }],
      'endCall started',
    ]);

    resolveEndCall();
  });
});
