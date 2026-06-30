import { markPendingReflection } from './dashboardReflectionSession.js';

export function endCallAndNavigateImmediately({
  endCall,
  clearDashboardCache,
  navigate,
  to,
  options = { replace: true },
}) {
  Promise.resolve()
    .then(() => endCall())
    .catch(() => {
      // Leaving the call screen is more important than blocking on final cleanup.
    });
  markPendingReflection();
  clearDashboardCache();
  navigate(to, options);
}
