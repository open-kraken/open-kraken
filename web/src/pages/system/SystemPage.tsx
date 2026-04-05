import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { useAppShell } from '@/state/app-shell-store';

type HealthPayload = {
  status?: string;
  service?: string;
  requestId?: string;
  warnings?: Array<{ name?: string; reason?: string }>;
  errors?: Array<{ name?: string; reason?: string }>;
};

export const SystemPage = () => {
  const { t } = useI18n();
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
          <p className="page-eyebrow">{t('system.eyebrow')}</p>
          <h1>{t('system.title')}</h1>
          <p className="route-page__intro">{t('system.intro')}</p>
        </div>
        <div className="route-page__metric-strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('system.metric.workspace')}</span>
            <strong>{workspace.workspaceId}</strong>
            <small>{workspace.workspaceLabel}</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('system.metric.realtimeStream')}</span>
            <strong>{translateRealtimeStatusLabel(realtime.status, t)}</strong>
            <small>{translateRealtimeDetail(realtime.detail, t)}</small>
          </article>
        </div>
      </div>

      <div className="route-page__grid route-page__grid--system">
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('system.runtimeEyebrow')}</p>
              <h2>{t('system.backendHealth')}</h2>
            </div>
            <button type="button" className="route-page__panel-refresh" onClick={() => void refresh()}>
              {t('system.refresh')}
            </button>
          </header>
          {healthError ? (
            <p className="system-route-page__error">{healthError}</p>
          ) : (
            <dl className="system-route-page__kv">
              <div>
                <dt>{t('system.http')}</dt>
                <dd>{healthHttp ?? t('system.emDash')}</dd>
              </div>
              <div>
                <dt>{t('system.statusField')}</dt>
                <dd>{health?.status ?? t('system.emDash')}</dd>
              </div>
              <div>
                <dt>{t('system.serviceField')}</dt>
                <dd>{health?.service ?? t('system.emDash')}</dd>
              </div>
              <div>
                <dt>{t('system.requestIdField')}</dt>
                <dd className="system-route-page__mono">{health?.requestId ?? t('system.emDash')}</dd>
              </div>
            </dl>
          )}
          <p className="route-page__intro">{t('system.healthIntro')}</p>
        </section>

        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('system.clientEyebrow')}</p>
              <h2>{t('system.shellNoticesTitle')}</h2>
            </div>
          </header>
          <p>{t('system.shellNoticesBody', { count: notifications.length })}</p>
        </section>

        <section className="route-page__panel system-route-page__panel--span">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('system.contractsEyebrow')}</p>
              <h2>{t('system.contractsTitle')}</h2>
            </div>
          </header>
          <ul className="system-route-page__checklist">
            <li>{t('system.contract1')}</li>
            <li>{t('system.contract2')}</li>
            <li>{t('system.contract3')}</li>
          </ul>
        </section>
      </div>
    </section>
  );
};
