import { useCallback, useEffect, useState } from 'react';
import { useAppShell } from '@/state/app-shell-store';

type HealthPayload = {
  status?: string;
  service?: string;
  requestId?: string;
  warnings?: Array<{ name?: string; reason?: string }>;
  errors?: Array<{ name?: string; reason?: string }>;
};

export const SystemPage = () => {
  const { notifications, realtime, workspace } = useAppShell();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthHttp, setHealthHttp] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setHealthError(null);
    try {
      const response = await fetch('/healthz', { method: 'GET', headers: { accept: 'application/json' } });
      setHealthHttp(response.status);
      if (!response.ok) {
        setHealth(null);
        setHealthError(`HTTP ${response.status}`);
        return;
      }
      setHealth((await response.json()) as HealthPayload);
    } catch (error: unknown) {
      setHealth(null);
      setHealthHttp(null);
      setHealthError(error instanceof Error ? error.message : 'health_probe_failed');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="page-card system-route-page" data-route-page="system" data-page-entry="system-runtime">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">System</p>
          <h1>Observability, health, and control-plane signals</h1>
          <p className="route-page__intro">
            This surface mirrors the production-readiness baseline: backend <code>/healthz</code>, websocket stream
            posture, and client-visible degradation hooks. Authorization and capability truth remain server-owned; the UI
            only renders read models and failure affordances described in the contracts.
          </p>
        </div>
        <div className="route-page__metric-strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">Workspace</span>
            <strong>{workspace.workspaceId}</strong>
            <small>{workspace.workspaceLabel}</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">Realtime stream</span>
            <strong>{realtime.status}</strong>
            <small>{realtime.detail}</small>
          </article>
        </div>
      </div>

      <div className="route-page__grid route-page__grid--system">
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Runtime</p>
              <h2>Backend health</h2>
            </div>
            <button type="button" className="route-page__panel-refresh" onClick={() => void refresh()}>
              Refresh
            </button>
          </header>
          {healthError ? (
            <p className="system-route-page__error">{healthError}</p>
          ) : (
            <dl className="system-route-page__kv">
              <div>
                <dt>HTTP</dt>
                <dd>{healthHttp ?? '—'}</dd>
              </div>
              <div>
                <dt>status</dt>
                <dd>{health?.status ?? '—'}</dd>
              </div>
              <div>
                <dt>service</dt>
                <dd>{health?.service ?? '—'}</dd>
              </div>
              <div>
                <dt>requestId</dt>
                <dd className="system-route-page__mono">{health?.requestId ?? '—'}</dd>
              </div>
            </dl>
          )}
          <p className="route-page__intro">
            Bound probe: <code>GET /healthz</code>. When dependencies degrade, warnings may appear without failing the
            process—surface them here before users hit secondary failures.
          </p>
        </section>

        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Client</p>
              <h2>Shell notices</h2>
            </div>
          </header>
          <p>
            Active global notices: <strong>{notifications.length}</strong>. Pages should consume the shell outlet
            instead of inventing parallel banners (see observability baseline).
          </p>
        </section>

        <section className="route-page__panel system-route-page__panel--span">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Contracts</p>
              <h2>What this console is responsible for</h2>
            </div>
          </header>
          <ul className="system-route-page__checklist">
            <li>
              <strong>Roster & roles</strong> — owner / supervisor / assistant / member projections with server-derived{' '}
              <code>capabilities</code>, not UI-inferred privileges.
            </li>
            <li>
              <strong>Multi-agent runtime</strong> — terminal attach/snapshot/delta/status channels per session; presence
              vs terminal status stay distinct.
            </li>
            <li>
              <strong>Stream monitoring</strong> — reconnect/backoff visibility, route-level load failures, and attach
              failures surfaced as actionable UI state.
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
};
