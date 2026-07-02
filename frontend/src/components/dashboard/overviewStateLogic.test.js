import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getMomOverviewState } from './overviewStateLogic.js';
import { DASHBOARD_LOADING_STEPS } from './dashboardLoadingSteps.js';
import { PENDING_CALL_ID_KEY } from '../../pages/dashboardReflectionSession.js';

function withSessionStorage(run) {
  const previousStorage = globalThis.sessionStorage;
  const storage = new Map();
  globalThis.sessionStorage = {
    setItem: (key, value) => storage.set(key, value),
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
  };

  try {
    return run(storage);
  } finally {
    globalThis.sessionStorage = previousStorage;
  }
}

describe('getMomOverviewState', () => {
  it('shows a progressive dashboard when calls exist but no reflection is ready', () => {
    const state = getMomOverviewState(
      { current: null },
      { activity: { totalCalls: 1, callsToday: 1, callsThisWeek: 1 } },
    );

    assert.equal(state, 'progressive');
  });

  it('uses the content dashboard when a current reflection exists', () => {
    withSessionStorage(() => {
      const state = getMomOverviewState(
        { current: { conversationSummary: 'Today felt lighter.' }, currentCallId: 'call-1' },
        { activity: { totalCalls: 1 } },
      );

      assert.equal(state, 'content');
    });
  });

  it('shows a progressive dashboard while waiting for a newer call reflection', () => {
    withSessionStorage((storage) => {
      storage.set(PENDING_CALL_ID_KEY, 'call-2');

      const state = getMomOverviewState(
        { current: { conversationSummary: 'Yesterday felt heavy.' }, currentCallId: 'call-1' },
        { activity: { totalCalls: 2 } },
      );

      assert.equal(state, 'progressive');
    });
  });

  it('uses the empty dashboard before the first call', () => {
    const state = getMomOverviewState(
      { current: null },
      { activity: { totalCalls: 0, callsToday: 0, callsThisWeek: 0 } },
    );

    assert.equal(state, 'empty');
  });

  it('falls back when reflection polling times out', () => {
    const state = getMomOverviewState(
      { current: null },
      { activity: { totalCalls: 1, callsToday: 1, callsThisWeek: 1 } },
      { reflectionTimedOut: true },
    );

    assert.equal(state, 'processing');
  });
});

describe('DASHBOARD_LOADING_STEPS', () => {
  it('pairs every rotating loader illustration with a friendly line of text', () => {
    assert.ok(DASHBOARD_LOADING_STEPS.length >= 3);

    for (const step of DASHBOARD_LOADING_STEPS) {
      assert.equal(typeof step.illustration, 'string');
      assert.ok(step.illustration.length > 0);
      assert.equal(typeof step.text, 'string');
      assert.ok(step.text.length >= 6);
    }
  });
});
