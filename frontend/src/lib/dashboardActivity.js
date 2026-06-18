const ACTIVITY_CALL_KEYS = {
  today: ['callsToday', 'todayCalls'],
  week: ['callsThisWeek', 'weekCalls'],
  month: ['callsThisMonth', 'monthCalls'],
};

export function getActivityCallCount(activity = {}, period = 'today') {
  const keys = ACTIVITY_CALL_KEYS[period] || ACTIVITY_CALL_KEYS.today;
  return keys.reduce((max, key) => {
    const value = Number(activity?.[key]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

export function computeActivityAwareStreak(daySeries, activity = {}) {
  const points = Array.isArray(daySeries?.month?.points) ? daySeries.month.points : [];
  let analyzedStreak = 0;

  for (let index = points.length - 1; index >= 0; index -= 1) {
    if ((Number(points[index]?.callCount) || 0) > 0) analyzedStreak += 1;
    else break;
  }

  if (analyzedStreak > 0) return analyzedStreak;
  return getActivityCallCount(activity, 'today') > 0 ? 1 : 0;
}
