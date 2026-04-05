import { appNavGroups, appRoutes } from '@/routes';
import { useAppShell } from '@/state/app-shell-store';
import { HealthToolbarCard } from '@/components/shell/HealthToolbarCard';
import { ChatPage } from '@/pages/chat/ChatPage';
import { MembersPage } from '@/pages/members/MembersPage';
import { RoadmapPage } from '@/pages/roadmap/RoadmapPage';
import { TerminalPage } from '@/pages/terminal/TerminalPage';
import { SystemPage } from '@/pages/system/SystemPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { NodesPage } from '@/pages/nodes/NodesPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';

const pageByRoute = {
  chat: ChatPage,
  members: MembersPage,
  roadmap: RoadmapPage,
  terminal: TerminalPage,
  system: SystemPage,
  settings: SettingsPage,
  nodes: NodesPage,
  dashboard: DashboardPage
};

export const AppShell = () => {
  const { route, workspace, notifications, realtime, navigate, dismissNotification } = useAppShell();
  const ActivePage = pageByRoute[route.id];

  return (
    <div className="app-shell" data-shell-route={route.id}>
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <p className="app-shell__eyebrow">open-kraken</p>
          <h1>Workspace console</h1>
          <p className="app-shell__workspace">{workspace.workspaceLabel}</p>
        </div>

        <div className="app-shell__nav-wrap">
          {appNavGroups.map((group) => (
            <div key={group.id} className="app-shell__nav-group">
              <p className="app-shell__nav-group-label" id={`nav-group-${group.id}`}>
                {group.label}
              </p>
              <nav className="app-shell__nav" aria-labelledby={`nav-group-${group.id}`}>
                {group.routeIds.map((routeId) => {
                  const item = appRoutes.find((candidate) => candidate.id === routeId);
                  if (!item) {
                    return null;
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={item.id === route.id ? 'page' : undefined}
                      className={
                        item.id === route.id ? 'app-shell__nav-link app-shell__nav-link--active' : 'app-shell__nav-link'
                      }
                      onClick={() => navigate(item.id)}
                    >
                      <span>{item.label}</span>
                      <small>{item.description}</small>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </aside>

      <main className="app-shell__content">
        <header className="app-shell__toolbar">
          <div className="app-shell__toolbar-card" data-shell-slot="workspace">
            <span className="app-shell__toolbar-label">Workspace</span>
            <strong>{workspace.workspaceId}</strong>
            <small>{workspace.membersOnline ?? 0} online members</small>
          </div>
          <div className="app-shell__toolbar-card" data-shell-slot="realtime">
            <span className="app-shell__toolbar-label">Realtime</span>
            <strong>{realtime.status}</strong>
            <small>{realtime.detail}</small>
          </div>
          <HealthToolbarCard />
          <div className="app-shell__toolbar-card" data-shell-slot="errors">
            <span className="app-shell__toolbar-label">Notices</span>
            <strong>{notifications.length}</strong>
            <small>Escalations mirrored from pages into the shell outlet.</small>
          </div>
        </header>

        <section className="app-shell__notices" aria-label="Global notices">
          {notifications.length === 0 ? (
            <div className="toast toast--empty">No global notices</div>
          ) : (
            notifications.map((toast) => (
              <article key={toast.id} className={`toast toast--${toast.tone}`}>
                <div>
                  <strong>{toast.title}</strong>
                  <p>{toast.detail}</p>
                </div>
                <button type="button" onClick={() => dismissNotification(toast.id)}>
                  Dismiss
                </button>
              </article>
            ))
          )}
        </section>

        <section className="app-shell__page-frame">
          <ActivePage />
        </section>
      </main>
    </div>
  );
};
