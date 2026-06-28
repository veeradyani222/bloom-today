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
  clearDashboardCache();
  navigate(to, options);
}
