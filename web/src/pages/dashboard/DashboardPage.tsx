/**
 * DashboardPage — main page for the Token + Activity Dashboard (T09).
 * Integrates TeamTokenSummary, TokenChart, AgentActivityPanel, and NodeTokenBreakdown.
 * Subscribes to the `token.stats_updated` realtime event for live refreshes.
 */

import { useEffect } from 'react';
import { useAppShell } from '@/state/app-shell-store';
import { useDashboardStore } from '@/state/dashboardStore';
import { TeamTokenSummary } from '@/features/dashboard/TeamTokenSummary';
import { TokenChart } from '@/features/dashboard/TokenChart';
import { AgentActivityPanel } from '@/features/dashboard/AgentActivityPanel';
import { NodeTokenBreakdown } from '@/features/dashboard/NodeTokenBreakdown';

export const DashboardPage = () => {
  const { realtimeClient } = useAppShell();
  const store = useDashboardStore();

  // Load dashboard data on mount
  useEffect(() => {
    void store.loadDashboard();
  }, [store.loadDashboard]);

  // Subscribe to realtime token stats updates
  useEffect(() => {
    // token.stats_updated: server pushes refreshed aggregates
    const sub = realtimeClient.subscribe<{ period: string }>('token.stats_updated', () => {
      void store.loadDashboard();
    });

    return () => {
      sub.unsubscribe();
    };
    // store.loadDashboard is stable (useCallback with no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeClient]);

  return (
    <section className="page-card page-card--dashboard" data-page-entry="dashboard">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">Observability</p>
          <h1>Token consumption &amp; agent activity</h1>
          <p className="route-page__intro">
            Real-time view of agent token usage, cost breakdown, and execution status across the workspace.
          </p>
        </div>
      </div>

      {/* Error state */}
      {store.loadState === 'error' && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: 'rgba(220,38,38,0.1)',
            border: '1px solid #dc2626',
            color: '#fca5a5',
            marginBottom: '16px'
          }}
        >
          Failed to load dashboard data: {store.errorMessage}
        </div>
      )}

      {/* Loading state */}
      {store.loadState === 'loading' && store.tokenStats.length === 0 && (
        <div role="status" style={{ color: '#6b7280', padding: '32px', textAlign: 'center' }}>
          Loading dashboard…
        </div>
      )}

      {/* Summary cards */}
      <TeamTokenSummary
        stats={store.tokenStats}
        activities={store.activities}
        period={store.period}
      />

      {/* Main content panels */}
      <div
        className="route-page__grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}
      >
        {/* Token chart */}
        <section
          className="route-page__panel"
          style={{ border: '1px solid #374151', borderRadius: '8px', padding: '16px' }}
        >
          <header style={{ marginBottom: '12px' }}>
            <p className="page-eyebrow">Consumption</p>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Tokens by member</h2>
          </header>
          <TokenChart stats={store.tokenStats} />
        </section>

        {/* Node token breakdown */}
        <section
          className="route-page__panel"
          style={{ border: '1px solid #374151', borderRadius: '8px', padding: '16px' }}
        >
          <header style={{ marginBottom: '12px' }}>
            <p className="page-eyebrow">Infrastructure</p>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Tokens by node</h2>
          </header>
          <NodeTokenBreakdown stats={store.tokenStats} />
        </section>
      </div>

      {/* Agent activity table */}
      <section
        className="route-page__panel"
        style={{ border: '1px solid #374151', borderRadius: '8px', padding: '16px', marginTop: '24px' }}
      >
        <header style={{ marginBottom: '12px' }}>
          <p className="page-eyebrow">Activity</p>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Agent activity</h2>
        </header>
        <AgentActivityPanel activities={store.activities} />
      </section>
    </section>
  );
};
