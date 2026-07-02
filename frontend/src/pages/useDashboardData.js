import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { isReflectionPending } from '../components/dashboard/overviewStateLogic';
import {
  clearPendingReflection,
  hasPendingReflectionMarker,
  isReflectionReady,
} from './dashboardReflectionSession';

function shouldPollForReflection(insights, role) {
  if (role !== 'mom' || !insights) return false;

  if (isReflectionReady(insights)) {
    return false;
  }

  if (isReflectionPending(insights?.mom, insights)) {
    return true;
  }

  return hasPendingReflectionMarker();
}

const dashboardCache = new Map();
const DASHBOARD_CACHE_VERSION = 'v3-pending-call-reflection';
const REFLECTION_POLL_INTERVAL_MS = 2500;
const REFLECTION_POLL_MAX_ATTEMPTS = 30;

export function clearDashboardCache() {
  dashboardCache.clear();
}

function buildCacheKey(token, role) {
  return `${DASHBOARD_CACHE_VERSION}::${token || 'anon'}::${role || 'mom'}`;
}

async function fetchDashboardCore(token, role) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const [nextInsights, nextDaySeries] = await Promise.all([
    apiRequest(`/api/dashboard/insights?timeZone=${encodeURIComponent(tz)}`, { token }),
    apiRequest(`/api/dashboard/day-points?timeZone=${encodeURIComponent(tz)}`, { token }),
  ]);

  return {
    tz,
    nextInsights,
    nextDaySeries,
    nextCore: {
      insights: nextInsights,
      daySeries: nextDaySeries,
      momTips: [],
      quickTips: { summary: '', tips: [] },
    },
  };
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
  const [reflectionTimedOut, setReflectionTimedOut] = useState(false);
  const pollAttemptsRef = useRef(0);

  const applyCorePayload = useCallback((nextInsights, nextDaySeries, nextCore) => {
    dashboardCache.set(cacheKey, nextCore);
    setInsights(nextInsights);
    setDaySeries(nextDaySeries);

    if (nextInsights?.mom?.current && isReflectionReady(nextInsights)) {
      clearPendingReflection();
      setReflectionTimedOut(false);
      pollAttemptsRef.current = 0;
    }
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    pollAttemptsRef.current = 0;
    setReflectionTimedOut(false);

    async function load() {
      const hasCachedData = Boolean(dashboardCache.get(cacheKey));
      if (!hasCachedData) {
        setLoading(true);
      }
      setError('');

      try {
        const { tz, nextInsights, nextDaySeries, nextCore } = await fetchDashboardCore(token, role);

        if (cancelled) return;

        applyCorePayload(nextInsights, nextDaySeries, nextCore);
        setLoading(false);

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
  }, [token, role, cacheKey, applyCorePayload]);

  useEffect(() => {
    if (loading || error || !shouldPollForReflection(insights, role)) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId = 0;

    async function pollForReflection() {
      if (cancelled) return;

      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current > REFLECTION_POLL_MAX_ATTEMPTS) {
        clearPendingReflection();
        setReflectionTimedOut(true);
        return;
      }

      try {
        const { nextInsights, nextDaySeries, nextCore } = await fetchDashboardCore(token, role);
        if (cancelled) return;

        applyCorePayload(nextInsights, nextDaySeries, nextCore);

        if (isReflectionReady(nextInsights)) {
          return;
        }

        if (!shouldPollForReflection(nextInsights, role)) {
          clearPendingReflection();
          return;
        }
      } catch {
        // Keep polling; the initial dashboard load already surfaced hard failures.
      }

      if (!cancelled) {
        timeoutId = window.setTimeout(pollForReflection, REFLECTION_POLL_INTERVAL_MS);
      }
    }

    timeoutId = window.setTimeout(pollForReflection, REFLECTION_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [loading, error, insights, role, token, applyCorePayload]);

  return {
    insights,
    daySeries,
    momTips,
    quickTips,
    loading,
    error,
    reflectionTimedOut,
  };
}
