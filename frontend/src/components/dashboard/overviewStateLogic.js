import { getActivityCallCount } from '../../lib/dashboardActivity.js';
import { getPendingReflectionCallId } from '../../pages/dashboardReflectionSession.js';

export function hasCompletedCallActivity(insights = {}) {
  const activity = insights?.activity || {};
  const totalCalls = Number(activity.totalCalls || 0);
  return totalCalls > 0 || getActivityCallCount(activity, 'today') > 0;
}

export function isReflectionPending(data, insights = {}) {
  if (data?.current) {
    const pendingCallId = getPendingReflectionCallId();
    if (pendingCallId && data?.currentCallId !== pendingCallId) {
      return true;
    }
    if (!pendingCallId) return false;
  }
  return hasCompletedCallActivity(insights);
}

export function getMomOverviewState(data, insights = {}, { reflectionTimedOut = false } = {}) {
  const pendingCallId = getPendingReflectionCallId();
  if (pendingCallId && data?.currentCallId !== pendingCallId) {
    return reflectionTimedOut ? 'processing' : 'progressive';
  }

  if (data?.current) return 'content';

  if (!hasCompletedCallActivity(insights)) {
    return 'empty';
  }

  return reflectionTimedOut ? 'processing' : 'progressive';
}
