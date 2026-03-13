import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const dashboardCache = new Map();

function buildCacheKey(token, role) {
  return `${token || 'anon'}::${role || 'mom'}`;
}

export function useDashboardData(token, role = 'mom') {
  const cacheKey = buildCacheKey(token, role);
  const cached = dashboardCache.get(cacheKey);

  const [insights, setInsights] = useState(cached?.insights || null);
  const [daySeries, setDaySeries] = useState(cached?.daySeries || null);
  const [momTips, setMomTips] = useState(cached?.momTips || []);
  const [quickTips, setQuickTips] = useState(cached?.quickTips || { summary: '', tips: [] });
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const hasCachedData = Boolean(dashboardCache.get(cacheKey));
      if (!hasCachedData) {
        setLoading(true);
      }
      setError('');

      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

        // Core dashboard payload first; this should unblock rendering quickly.
        const [nextInsights, nextDaySeries] = await Promise.all([
          apiRequest(`/api/dashboard/insights?timeZone=${encodeURIComponent(tz)}`, { token }),
          apiRequest(`/api/dashboard/day-points?timeZone=${encodeURIComponent(tz)}`, { token }),
        ]);

        const nextCore = {
          insights: nextInsights,
          daySeries: nextDaySeries,
          momTips: [],
          quickTips: { summary: '', tips: [] },
        };

        dashboardCache.set(cacheKey, nextCore);

        if (cancelled) return;

        setInsights(nextInsights);
        setDaySeries(nextDaySeries);
        setLoading(false);

        // Mom-only enrichments should not block first paint.
        if (role !== 'mom') {
          setMomTips([]);
          setQuickTips({ summary: '', tips: [] });
          return;
        }

        const [tips, nextQuickTips] = await Promise.all([
          apiRequest('/api/mom-tips/random', { token }).catch(() => ({ tips: [] })),
          apiRequest(`/api/dashboard/quick-tips?timeZone=${encodeURIComponent(tz)}`, { token }).catch(() => ({ summary: '', tips: [] })),
        ]);

        if (cancelled) return;

        const enriched = {
          ...nextCore,
          momTips: tips.tips || [],
          quickTips: nextQuickTips || { summary: '', tips: [] },
        };

        dashboardCache.set(cacheKey, enriched);
        setMomTips(enriched.momTips);
        setQuickTips(enriched.quickTips);
      } catch (nextError) {
        if (!cancelled) {
          const hasCacheFallback = Boolean(dashboardCache.get(cacheKey));
          if (!hasCacheFallback) {
            setError(nextError.message);
            setLoading(false);
          }
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [token, role, cacheKey]);

  return {
    insights,
    daySeries,
    momTips,
    quickTips,
    loading,
    error,
  };
}
