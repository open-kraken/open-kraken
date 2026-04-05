import { useAppShell } from '@/state/app-shell-store';

export const SettingsPage = () => {
  const { notifications, pushNotification, realtime, routes, workspace } = useAppShell();

  return (
    <section className="page-card page-card--settings" data-route-page="settings" data-page-entry="settings-runtime">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">Settings</p>
          <h1>Workspace-level defaults and operational guardrails</h1>
          <p className="route-page__intro">
            Settings consumes the shell-owned workspace context, realtime entry, and notice outlet directly. It does
            not create a second global banner or connection status source.
          </p>
        </div>
        <div className="route-page__metric-strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">Workspace</span>
            <strong>{workspace.workspaceLabel}</strong>
            <small>{workspace.membersOnline ?? 0} members online</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">Realtime</span>
            <strong>{realtime.status}</strong>
            <small>{realtime.detail}</small>
          </article>
        </div>
      </div>

      <div className="route-page__grid route-page__grid--settings">
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Shell notices</p>
              <h2>Single global error outlet</h2>
            </div>
          </header>
          <p>The shell currently exposes {notifications.length} global notification slots to every page.</p>
          <button
            type="button"
            className="route-page__action"
            onClick={() =>
              pushNotification({
                tone: 'info',
                title: 'Settings checkpoint',
                detail: `Workspace ${workspace.workspaceId} verified route registration and realtime state.`
              })
            }
          >
            Emit shell notice
          </button>
        </section>

        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Formal routes</p>
              <h2>Registered app surfaces</h2>
            </div>
          </header>
          <ul className="route-page__rule-list">
            {routes.map((route) => (
              <li key={route.id}>
                <strong>{route.path}</strong> {route.description}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
};
