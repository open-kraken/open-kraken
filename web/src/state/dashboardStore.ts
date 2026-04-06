/**
 * Dashboard store — shared state for the token / activity dashboard (T09).
 * Encapsulates loading token stats and agent activity via a custom hook.
 */

import { useCallback } from 'react';
import type { TokenStats, AgentActivity } from '@/types/token';
import { getTokenStats, getAgentActivity } from '@/api/tokens';
import { useAsyncStore, type AsyncLoadState } from './useAsyncStore';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type DashboardLoadState = AsyncLoadState;

type DashboardData = {
  tokenStats: TokenStats[];
  activities: AgentActivity[];
  period: string;
};

const initialData: DashboardData = { tokenStats: [], activities: [], period: '' };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useDashboardStore
 * Loads and exposes token stats + agent activity.
 * Intended for use at DashboardPage level.
 */
export const useDashboardStore = () => {
  const loadFn = useCallback(async (): Promise<DashboardData> => {
    const [statsRes, activityRes] = await Promise.all([getTokenStats(), getAgentActivity()]);
    return {
      tokenStats: statsRes.stats,
      activities: activityRes.activities,
      period: statsRes.period
    };
  }, []);

  const store = useAsyncStore(initialData, loadFn);

  return {
    tokenStats: store.data.tokenStats,
    activities: store.data.activities,
    loadState: store.loadState,
    errorMessage: store.errorMessage,
    period: store.data.period,
    loadDashboard: store.load
  };
};
