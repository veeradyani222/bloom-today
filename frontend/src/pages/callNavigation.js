import { markPendingReflection, setPendingReflectionCallId } from './dashboardReflectionSession.js';

export function endCallAndNavigateImmediately({
  endCall,
  clearDashboardCache,
  navigate,
  to,
  options = { replace: true },
}) {
  Promise.resolve()
    .then(() => endCall())
    .then((callId) => {
      if (callId) setPendingReflectionCallId(callId);
    })
    .catch(() => {
      // Leaving the call screen is more important than blocking on final cleanup.
    });
  markPendingReflection();
  clearDashboardCache();
  navigate(to, options);
}
