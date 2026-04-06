import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { appNavGroups, appRoutes, type AppRouteId } from '@/routes';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { useAppShell } from '@/state/app-shell-store';
import { useAuth } from '@/auth/AuthProvider';
import { HealthToolbarCard } from '@/components/shell/HealthToolbarCard';
import { NavRouteIcon } from '@/components/shell/NavRouteIcon';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { getNodes } from '@/api/nodes';

const ChatPage = lazy(() => import('@/pages/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const MembersPage = lazy(() => import('@/pages/members/MembersPage').then((m) => ({ default: m.MembersPage })));
const RoadmapPage = lazy(() => import('@/pages/roadmap/RoadmapPage').then((m) => ({ default: m.RoadmapPage })));
const TerminalPage = lazy(() => import('@/pages/terminal/TerminalPage').then((m) => ({ default: m.TerminalPage })));
const SystemPage = lazy(() => import('@/pages/system/SystemPage').then((m) => ({ default: m.SystemPage })));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NodesPage = lazy(() => import('@/pages/nodes/NodesPage').then((m) => ({ default: m.NodesPage })));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LedgerPage = lazy(() => import('@/pages/ledger/LedgerPage').then((m) => ({ default: m.LedgerPage })));

const pageByRoute = {
  chat: ChatPage,
  members: MembersPage,
  roadmap: RoadmapPage,
  terminal: TerminalPage,
  system: SystemPage,
  settings: SettingsPage,
  nodes: NodesPage,
  dashboard: DashboardPage,
  ledger: LedgerPage
};

/** Mouse/pointer only: block focus so the scrollable nav does not run scrollIntoView (items jump). Touch unchanged. */
const suppressNavButtonPointerFocus = (event: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) => {
  if (event.button !== 0) {
    return;
  }
  if (event.type === 'pointerdown' && 'pointerType' in event && event.pointerType !== 'mouse') {
    return;
  }
  event.preventDefault();
};

type ClusterSummary = { total: number; online: number; degraded: number; offline: number };

/**
 * Signal strength level derived from network latency (ms).
 * 4 = excellent (<80ms), 3 = good (<200ms), 2 = fair (<500ms), 1 = poor (>=500ms), 0 = unreachable.
 */
type SignalLevel = 0 | 1 | 2 | 3 | 4;

const latencyToSignal = (ms: number | null): SignalLevel => {
  if (ms === null) return 0;
  if (ms < 80) return 4;
  if (ms < 200) return 3;
  if (ms < 500) return 2;
  return 1;
};

const signalTone = (level: SignalLevel): 'ok' | 'warn' | 'bad' => {
  if (level >= 3) return 'ok';
  if (level === 2) return 'warn';
  return 'bad';
};

/** 4-bar signal strength icon, like mobile reception bars. */
const SignalBars = ({ level }: { level: SignalLevel }) => {
  const barHeights = [4, 7, 10, 13];
  const tone = signalTone(level);
  return (
    <svg
      className="app-shell__signal-bars"
      data-signal-tone={tone}
      width="16"
      height="14"
      viewBox="0 0 16 14"
      fill="none"
      aria-hidden
    >
      {barHeights.map((h, i) => {
        const active = i < level;
        return (
          <rect
            key={i}
            x={i * 4}
            y={14 - h}
            width="3"
            height={h}
            rx="0.5"
            className={active ? 'app-shell__signal-bar--active' : 'app-shell__signal-bar--inactive'}
          />
        );
      })}
    </svg>
  );
};

export const AppShell = () => {
  const { t } = useI18n();
  const { route, workspace, notifications, realtime, navigate, dismissNotification } = useAppShell();
  const { account, logout } = useAuth();
  const ActivePage = pageByRoute[route.id];

  const routeLabel = (routeId: AppRouteId) => t(`routes.${routeId}.label`);
  const routeDescription = (routeId: AppRouteId) => t(`routes.${routeId}.description`);
  const navGroupLabel = (groupId: (typeof appNavGroups)[number]['id']) => t(`navGroups.${groupId}`);

  // Cluster / node summary for the status bar
  const [cluster, setCluster] = useState<ClusterSummary | null>(null);
  // Network latency (ms) measured by pinging /healthz
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const refreshCluster = useCallback(() => {
    const start = performance.now();
    void getNodes()
      .then(({ nodes }) => {
        const elapsed = Math.round(performance.now() - start);
        setLatencyMs(elapsed);
        setCluster({
          total: nodes.length,
          online: nodes.filter((n) => n.status === 'online').length,
          degraded: nodes.filter((n) => n.status === 'degraded').length,
          offline: nodes.filter((n) => n.status === 'offline').length
        });
      })
      .catch(() => {
        setCluster(null);
        setLatencyMs(null);
      });
  }, []);

  useEffect(() => {
    refreshCluster();
    const id = window.setInterval(refreshCluster, 15000);
    return () => window.clearInterval(id);
  }, [refreshCluster]);

  useEffect(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.closest('.app-shell__nav')) {
      el.blur();
    }
  }, [route.id]);

  return (
    <div className="app-shell" data-shell-route={route.id}>
      <aside className="app-shell__sidebar" aria-label={t('shell.primaryNav')}>
        <div className="app-shell__brand">
          <div className="app-shell__brand-row">
            <span className="app-shell__logo" aria-hidden />
            <div className="app-shell__brand-copy">
              <p className="app-shell__eyebrow">{t('shell.brand')}</p>
              <h1>{t('shell.console')}</h1>
            </div>
          </div>
          <p className="app-shell__workspace" title={workspace.workspaceLabel}>
            {workspace.workspaceLabel}
          </p>
        </div>

        <div className="app-shell__nav-wrap">
          {appNavGroups.map((group) => (
            <div key={group.id} className="app-shell__nav-group">
              <p className="app-shell__nav-group-label" id={`nav-group-${group.id}`}>
                {navGroupLabel(group.id)}
              </p>
              <nav className="app-shell__nav" aria-labelledby={`nav-group-${group.id}`}>
                {group.routeIds.map((routeId) => {
                  const item = appRoutes.find((candidate) => candidate.id === routeId);
                  if (!item) {
                    return null;
                  }
                  const isActive = item.id === route.id;
                  const label = routeLabel(item.id);
                  const description = routeDescription(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-nav-route={item.id}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={`${label}. ${description}`}
                      title={description}
                      className={isActive ? 'app-shell__nav-link app-shell__nav-link--active' : 'app-shell__nav-link'}
                      onPointerDown={suppressNavButtonPointerFocus}
                      onMouseDown={suppressNavButtonPointerFocus}
                      onClick={(event) => {
                        navigate(item.id);
                        event.currentTarget.blur();
                      }}
                    >
                      <NavRouteIcon routeId={item.id} className="app-shell__nav-icon" />
                      <span className="app-shell__nav-label">{label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {account && (
          <div className="app-shell__account">
            <div className="app-shell__account-avatar" aria-hidden>{account.avatar}</div>
            <div className="app-shell__account-info">
              <span className="app-shell__account-name">{account.displayName}</span>
              <span className="app-shell__account-role">{account.role}</span>
            </div>
            <button type="button" className="app-shell__account-logout" onClick={logout} title="Sign out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}

        <div className="app-shell__theme">
          <ThemeToggle />
        </div>
      </aside>

      <main className="app-shell__content">
        {notifications.length > 0 ? (
          <section className="app-shell__notices" aria-label={t('shell.notices')}>
            {notifications.map((toast) => (
              <article key={toast.id} className={`toast toast--${toast.tone}`}>
                <div>
                  <strong>{toast.title}</strong>
                  <p>{toast.detail}</p>
                </div>
                <button type="button" onClick={() => dismissNotification(toast.id)}>
                  {t('shell.dismiss')}
                </button>
              </article>
            ))}
          </section>
        ) : null}

        <section className="app-shell__page-frame">
          <Suspense fallback={<div className="app-shell__page-loading">{t('shell.pageLoading')}</div>}>
            <ActivePage />
          </Suspense>
        </section>

        {/* Fixed bottom status bar */}
        <footer className="app-shell__statusbar" aria-label={t('shell.statusBar')}>
          {/* Workspace */}
          <div
            className="app-shell__statusbar-chip app-shell__statusbar-chip--workspace"
            data-shell-slot="workspace"
            title={workspace.workspaceLabel}
          >
            <span className="app-shell__statusbar-chip-id">{workspace.workspaceId}</span>
            <span className="app-shell__statusbar-sep" aria-hidden>·</span>
            <span className="app-shell__statusbar-chip-meta">{t('shell.onlineMembers', { count: workspace.membersOnline ?? 0 })}</span>
          </div>

          {/* Realtime */}
          <div
            className="app-shell__statusbar-chip app-shell__statusbar-chip--realtime"
            data-shell-slot="realtime"
            title={translateRealtimeDetail(realtime.detail, t)}
          >
            <span className="app-shell__statusbar-label">{t('shell.realtime')}</span>
            <span className="app-shell__statusbar-dot" data-tone={realtime.status === 'connected' ? 'ok' : realtime.status === 'reconnecting' ? 'warn' : 'bad'} aria-hidden />
            <span className="app-shell__statusbar-chip-status">{translateRealtimeStatusLabel(realtime.status, t)}</span>
          </div>

          {/* Backend health */}
          <HealthToolbarCard />

          {/* Network / cluster */}
          <div
            className="app-shell__statusbar-chip app-shell__statusbar-chip--network"
            data-shell-slot="cluster"
            title={latencyMs !== null ? `${latencyMs}ms` : t('statusbar.unreachable')}
          >
            <SignalBars level={latencyToSignal(latencyMs)} />
            <span className="app-shell__statusbar-latency" data-tone={signalTone(latencyToSignal(latencyMs))}>
              {latencyMs !== null ? `${latencyMs}ms` : '—'}
            </span>
            {cluster && (
              <span className="app-shell__statusbar-chip-meta">
                {t('statusbar.clusterSummary', {
                  total: cluster.total,
                  online: cluster.online,
                  degraded: cluster.degraded,
                  offline: cluster.offline
                })}
              </span>
            )}
          </div>

          {/* Notices */}
          {notifications.length > 0 ? (
            <div
              className="app-shell__statusbar-chip app-shell__statusbar-chip--notices"
              data-shell-slot="errors"
              title={t('shell.notices')}
            >
              <span className="app-shell__statusbar-label">{t('shell.notices')}</span>
              <span className="app-shell__statusbar-badge" aria-hidden>
                {notifications.length}
              </span>
            </div>
          ) : null}
        </footer>
      </main>
    </div>
  );
};
