import { getActivityCallCount } from '../../lib/dashboardActivity.js';

export function hasCompletedCallActivity(insights = {}) {
  const activity = insights?.activity || {};
  const totalCalls = Number(activity.totalCalls || 0);
  return totalCalls > 0 || getActivityCallCount(activity, 'today') > 0;
}

export function isReflectionPending(data, insights = {}) {
  if (data?.current) return false;
  return hasCompletedCallActivity(insights);
}

export function getMomOverviewState(data, insights = {}, { reflectionTimedOut = false } = {}) {
  if (data?.current) return 'content';

  if (!hasCompletedCallActivity(insights)) {
    return 'empty';
  }

  return reflectionTimedOut ? 'processing' : 'loading';
}
