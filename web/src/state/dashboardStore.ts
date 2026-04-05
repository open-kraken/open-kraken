/**
 * Dashboard store — shared state for the token / activity dashboard (T09).
 * Encapsulates loading token stats and agent activity via a custom hook.
 */

import { useState, useCallback } from 'react';
import type { TokenStats, AgentActivity } from '@/types/token';
import { getTokenStats, getAgentActivity } from '@/api/tokens';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type DashboardLoadState = 'idle' | 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useDashboardStore
 * Loads and exposes token stats + agent activity.
 * Intended for use at DashboardPage level.
 */
export const useDashboardStore = () => {
  const [tokenStats, setTokenStats] = useState<TokenStats[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [loadState, setLoadState] = useState<DashboardLoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('');

  /** Load both token stats and agent activity in parallel. */
  const loadDashboard = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const [statsRes, activityRes] = await Promise.all([getTokenStats(), getAgentActivity()]);
      setTokenStats(statsRes.stats);
      setPeriod(statsRes.period);
      setActivities(activityRes.activities);
      setLoadState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setLoadState('error');
    }
  }, []);

  return {
    tokenStats,
    activities,
    loadState,
    errorMessage,
    period,
    loadDashboard
  };
};
