import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getMomOverviewState } from './overviewStateLogic.js';
import { DASHBOARD_LOADING_STEPS } from './dashboardLoadingSteps.js';

describe('getMomOverviewState', () => {
  it('uses the normal empty dashboard when calls exist but no reflection is ready', () => {
    const state = getMomOverviewState(
      { current: null },
      { activity: { totalCalls: 1, callsToday: 1, callsThisWeek: 1 } },
    );

    assert.equal(state, 'empty');
  });

  it('uses the content dashboard when a current reflection exists', () => {
    const state = getMomOverviewState(
      { current: { conversationSummary: 'Today felt lighter.' } },
      { activity: { totalCalls: 1 } },
    );

    assert.equal(state, 'content');
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
