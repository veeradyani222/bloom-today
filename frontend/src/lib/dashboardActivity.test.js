import assert from 'node:assert/strict';
import test from 'node:test';
import { computeActivityAwareStreak, getActivityCallCount } from './dashboardActivity.js';

test('getActivityCallCount reads current dashboard activity field names', () => {
  assert.equal(getActivityCallCount({ callsToday: 1 }, 'today'), 1);
  assert.equal(getActivityCallCount({ callsThisWeek: 3 }, 'week'), 3);
  assert.equal(getActivityCallCount({ callsThisMonth: 7 }, 'month'), 7);
});

test('getActivityCallCount does not let empty legacy fields hide current activity', () => {
  assert.equal(getActivityCallCount({ weekCalls: 0, callsThisWeek: 4 }, 'week'), 4);
  assert.equal(getActivityCallCount({ monthCalls: 0, callsThisMonth: 6 }, 'month'), 6);
});

test('computeActivityAwareStreak prefers analyzed day points when available', () => {
  const daySeries = {
    month: {
      points: [
        { callCount: 1 },
        { callCount: 2 },
        { callCount: 0 },
        { callCount: 1 },
        { callCount: 1 },
      ],
    },
  };

  assert.equal(computeActivityAwareStreak(daySeries, { callsToday: 1 }), 2);
});

test('computeActivityAwareStreak counts today from raw activity while analysis is pending', () => {
  assert.equal(computeActivityAwareStreak({ month: { points: [] } }, { callsToday: 1 }), 1);
  assert.equal(computeActivityAwareStreak({ month: { points: [{ callCount: 0 }] } }, { todayCalls: 2 }), 1);
});
