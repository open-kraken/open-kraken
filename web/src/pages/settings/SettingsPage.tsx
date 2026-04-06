import { useCallback, useEffect, useState } from 'react';
import type { AppLocale } from '@/i18n/locale-storage';
import { APP_LOCALES } from '@/i18n/locale-storage';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { useAppShell } from '@/state/app-shell-store';
import { useTheme } from '@/theme/ThemeProvider';
import { appEnv } from '@/config/env';

type ApiDiagResult = {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
};

export const SettingsPage = () => {
  const { t, locale, setLocale } = useI18n();
  const { notifications, pushNotification, realtime, routes, workspace } = useAppShell();
  const { theme, toggleTheme } = useTheme();
  const [apiDiag, setApiDiag] = useState<ApiDiagResult | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);

  /** Ping the API healthz endpoint and measure latency. */
  const runApiDiagnostic = useCallback(async () => {
    setDiagRunning(true);
    const start = performance.now();
    try {
      const response = await fetch('/healthz', {
        method: 'GET',
        headers: { accept: 'application/json' }
      });
      const latencyMs = Math.round(performance.now() - start);
      setApiDiag({ ok: response.ok, status: response.status, latencyMs });
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      setApiDiag({
        ok: false,
        status: null,
        latencyMs,
        error: err instanceof Error ? err.message : 'Connection failed'
      });
    } finally {
      setDiagRunning(false);
    }
  }, []);

  // Run diagnostic on mount
  useEffect(() => { void runApiDiagnostic(); }, [runApiDiagnostic]);

  return (
    <section className="page-card page-card--settings" data-route-page="settings" data-page-entry="settings-runtime">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('settings.title')}</p>
          <h1>{t('settings.hero')}</h1>
          <p className="route-page__intro">{t('settings.intro')}</p>
        </div>
        <div className="route-page__metric-strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('shell.workspace')}</span>
            <strong>{workspace.workspaceLabel}</strong>
            <small>{t('settings.membersOnline', { count: workspace.membersOnline ?? 0 })}</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('shell.realtime')}</span>
            <strong>{translateRealtimeStatusLabel(realtime.status, t)}</strong>
            <small>{translateRealtimeDetail(realtime.detail, t)}</small>
          </article>
        </div>
      </div>

      <div className="route-page__grid route-page__grid--settings">
        {/* Language */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('settings.languageEyebrow')}</p>
              <h2>{t('settings.languageTitle')}</h2>
            </div>
          </header>
          <p>{t('settings.languageHint')}</p>
          <div className="route-page__language-row route-page__field-row">
            <select
              id="open-kraken-locale"
              className="route-page__action"
              aria-label={t('settings.languageTitle')}
              value={locale}
              onChange={(e) => setLocale(e.target.value as AppLocale)}
            >
              {APP_LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {t(`settings.lang.${loc}`)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Theme */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('settings.themeEyebrow')}</p>
              <h2>{t('settings.themeTitle')}</h2>
            </div>
          </header>
          <p>{t('settings.themeHint')}</p>
          <div className="route-page__field-row route-page__field-row--inline">
            <span>{t('settings.currentTheme')}: <strong>{theme}</strong></span>
            <button type="button" className="route-page__action" onClick={toggleTheme}>
              {theme === 'light' ? t('settings.switchDark') : t('settings.switchLight')}
            </button>
          </div>
        </section>

        {/* Shell notices */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('settings.shellNoticesEyebrow')}</p>
              <h2>{t('settings.shellNoticesTitle')}</h2>
            </div>
          </header>
          <p>{t('settings.shellNoticesBody', { count: notifications.length })}</p>
          <button
            type="button"
            className="route-page__action"
            onClick={() =>
              pushNotification({
                tone: 'info',
                title: t('settings.checkpointTitle'),
                detail: t('settings.checkpointDetail', { id: workspace.workspaceId }),
                tag: 'settings-checkpoint'
              })
            }
          >
            {t('settings.emitNotice')}
          </button>
        </section>

        {/* API connection diagnostics */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('settings.diagEyebrow')}</p>
              <h2>{t('settings.diagTitle')}</h2>
            </div>
            <button
              type="button"
              className="route-page__panel-refresh"
              onClick={() => void runApiDiagnostic()}
              disabled={diagRunning}
            >
              {diagRunning ? t('settings.diagRunning') : t('settings.diagRun')}
            </button>
          </header>
          <dl className="system-route-page__kv">
            <div>
              <dt>{t('settings.diagApiBase')}</dt>
              <dd className="system-route-page__mono">{appEnv.apiBaseUrl}</dd>
            </div>
            <div>
              <dt>{t('settings.diagWsBase')}</dt>
              <dd className="system-route-page__mono">{appEnv.wsBaseUrl}</dd>
            </div>
            <div>
              <dt>{t('settings.diagWorkspaceId')}</dt>
              <dd className="system-route-page__mono">{appEnv.defaultWorkspaceId}</dd>
            </div>
            {apiDiag && (
              <>
                <div>
                  <dt>{t('settings.diagStatus')}</dt>
                  <dd data-diag-ok={String(apiDiag.ok)}>
                    {apiDiag.ok ? `OK (${apiDiag.status})` : apiDiag.error ?? `HTTP ${apiDiag.status}`}
                  </dd>
                </div>
                <div>
                  <dt>{t('settings.diagLatency')}</dt>
                  <dd>{apiDiag.latencyMs}ms</dd>
                </div>
              </>
            )}
          </dl>
        </section>

        {/* Workspace info */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('settings.workspaceEyebrow')}</p>
              <h2>{t('settings.workspaceTitle')}</h2>
            </div>
          </header>
          <dl className="system-route-page__kv">
            <div>
              <dt>{t('settings.workspaceId')}</dt>
              <dd className="system-route-page__mono">{workspace.workspaceId}</dd>
            </div>
            <div>
              <dt>{t('settings.workspaceLabel')}</dt>
              <dd>{workspace.workspaceLabel}</dd>
            </div>
            <div>
              <dt>{t('settings.workspaceOnline')}</dt>
              <dd>{workspace.membersOnline ?? 0}</dd>
            </div>
            <div>
              <dt>{t('settings.realtimeStatus')}</dt>
              <dd>{translateRealtimeStatusLabel(realtime.status, t)}</dd>
            </div>
            <div>
              <dt>{t('settings.realtimeCursor')}</dt>
              <dd className="system-route-page__mono">{realtime.lastCursor ?? t('system.emDash')}</dd>
            </div>
          </dl>
        </section>

        {/* Routes reference */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('settings.formalRoutesEyebrow')}</p>
              <h2>{t('settings.formalRoutesTitle')}</h2>
            </div>
          </header>
          <ul className="route-page__rule-list">
            {routes.map((r) => (
              <li key={r.id}>
                <strong>{r.path}</strong> {t(`routes.${r.id}.description`)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
};
