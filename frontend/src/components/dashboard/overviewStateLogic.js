import { getActivityCallCount } from '../../lib/dashboardActivity.js';

export function getMomOverviewState(data, insights = {}) {
  if (data?.current) return 'content';

  const activity = insights?.activity || {};
  const totalCalls = Number(activity.totalCalls || 0);
  const hasCompletedCall = totalCalls > 0 || getActivityCallCount(activity, 'today') > 0;

  return hasCompletedCall ? 'loading' : 'empty';
}
