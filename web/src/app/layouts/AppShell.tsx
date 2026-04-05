import { useEffect } from 'react';
import { appNavGroups, appRoutes, type AppRouteId } from '@/routes';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { useAppShell } from '@/state/app-shell-store';
import { HealthToolbarCard } from '@/components/shell/HealthToolbarCard';
import { NavRouteIcon } from '@/components/shell/NavRouteIcon';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { ChatPage } from '@/pages/chat/ChatPage';
import { MembersPage } from '@/pages/members/MembersPage';
import { RoadmapPage } from '@/pages/roadmap/RoadmapPage';
import { TerminalPage } from '@/pages/terminal/TerminalPage';
import { SystemPage } from '@/pages/system/SystemPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { NodesPage } from '@/pages/nodes/NodesPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { LedgerPage } from '@/pages/ledger/LedgerPage';

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

export const AppShell = () => {
  const { t } = useI18n();
  const { route, workspace, notifications, realtime, navigate, dismissNotification } = useAppShell();
  const ActivePage = pageByRoute[route.id];

  const routeLabel = (routeId: AppRouteId) => t(`routes.${routeId}.label`);
  const routeDescription = (routeId: AppRouteId) => t(`routes.${routeId}.description`);
  const navGroupLabel = (groupId: (typeof appNavGroups)[number]['id']) => t(`navGroups.${groupId}`);

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

        <div className="app-shell__theme">
          <ThemeToggle />
        </div>
      </aside>

      <main className="app-shell__content">
        <header className="app-shell__toolbar app-shell__toolbar--compact" aria-label={t('shell.statusBar')}>
          <div
            className="app-shell__toolbar-chip app-shell__toolbar-chip--workspace"
            data-shell-slot="workspace"
            title={workspace.workspaceLabel}
          >
            <span className="sr-only">{t('shell.workspace')}</span>
            <span className="app-shell__toolbar-chip-id">{workspace.workspaceId}</span>
            <span className="app-shell__toolbar-chip-sep" aria-hidden>
              ·
            </span>
            <span className="app-shell__toolbar-chip-meta">{t('shell.onlineMembers', { count: workspace.membersOnline ?? 0 })}</span>
          </div>
          <div
            className="app-shell__toolbar-chip app-shell__toolbar-chip--realtime"
            data-shell-slot="realtime"
            title={translateRealtimeDetail(realtime.detail, t)}
          >
            <span className="sr-only">{t('shell.realtime')}</span>
            <span className="app-shell__toolbar-chip-status">{translateRealtimeStatusLabel(realtime.status, t)}</span>
          </div>
          <HealthToolbarCard />
          {notifications.length > 0 ? (
            <div
              className="app-shell__toolbar-chip app-shell__toolbar-chip--notices"
              data-shell-slot="errors"
              title={t('shell.notices')}
            >
              <span className="sr-only">
                {t('shell.notices')}: {notifications.length}
              </span>
              <span className="app-shell__toolbar-chip-badge" aria-hidden>
                {notifications.length}
              </span>
            </div>
          ) : null}
        </header>

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
          <ActivePage />
        </section>
      </main>
    </div>
  );
};
