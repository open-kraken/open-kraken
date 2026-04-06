/**
 * DashboardPage — Token + Activity Dashboard (T09).
 * Integrates TeamTokenSummary, TokenChart, AgentActivityPanel, NodeTokenBreakdown.
 * Subscribes to `token.stats_updated` realtime event for live refreshes.
 */

import { useEffect } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { useDashboardStore } from '@/state/dashboardStore';
import { TeamTokenSummary } from '@/features/dashboard/TeamTokenSummary';
import { TokenChart } from '@/features/dashboard/TokenChart';
import { AgentActivityPanel } from '@/features/dashboard/AgentActivityPanel';
import { NodeTokenBreakdown } from '@/features/dashboard/NodeTokenBreakdown';
import s from '@/features/dashboard/dashboard.module.css';

export const DashboardPage = () => {
  const { t } = useI18n();
  const { realtimeClient } = useAppShell();
  const store = useDashboardStore();

  useEffect(() => { void store.loadDashboard(); }, [store.loadDashboard]);

  useEffect(() => {
    const sub = realtimeClient.subscribe<{ period: string }>('token.stats_updated', () => {
      void store.loadDashboard();
    });
    return () => { sub.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeClient]);

  return (
    <section className={`page-card page-card--dashboard ${s['dashboard-page']}`} data-page-entry="dashboard">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('dashboard.eyebrow')}</p>
          <h1>{t('dashboard.title')}</h1>
          <p className="route-page__intro">{t('dashboard.intro')}</p>
        </div>
      </div>

      {store.loadState === 'error' && (
        <div role="alert" className={s['dashboard-error']}>
          {t('dashboard.loadError', { message: store.errorMessage ?? '' })}
        </div>
      )}

      {store.loadState === 'loading' && store.tokenStats.length === 0 && (
        <div role="status" className={s['dashboard-loading']}>{t('dashboard.loading')}</div>
      )}

      <TeamTokenSummary stats={store.tokenStats} activities={store.activities} period={store.period} />

      <div className={s['dashboard-grid']}>
        <section className={s['dashboard-panel']}>
          <header className={s['dashboard-panel__header']}>
            <p className="page-eyebrow">{t('dashboard.consumptionEyebrow')}</p>
            <h2 className={s['dashboard-panel__title']}>{t('dashboard.tokensByMember')}</h2>
          </header>
          <TokenChart stats={store.tokenStats} />
        </section>

        <section className={s['dashboard-panel']}>
          <header className={s['dashboard-panel__header']}>
            <p className="page-eyebrow">{t('dashboard.infraEyebrow')}</p>
            <h2 className={s['dashboard-panel__title']}>{t('dashboard.tokensByNode')}</h2>
          </header>
          <NodeTokenBreakdown stats={store.tokenStats} />
        </section>
      </div>

      <section className={s['dashboard-panel']}>
        <header className={s['dashboard-panel__header']}>
          <p className="page-eyebrow">{t('dashboard.activityEyebrow')}</p>
          <h2 className={s['dashboard-panel__title']}>{t('dashboard.agentActivity')}</h2>
        </header>
        <AgentActivityPanel activities={store.activities} />
      </section>
    </section>
  );
};
