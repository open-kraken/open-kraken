import type { AppLocale } from '@/i18n/locale-storage';
import { APP_LOCALES } from '@/i18n/locale-storage';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { useAppShell } from '@/state/app-shell-store';

export const SettingsPage = () => {
  const { t, locale, setLocale } = useI18n();
  const { notifications, pushNotification, realtime, routes, workspace } = useAppShell();

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
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('settings.languageEyebrow')}</p>
              <h2>{t('settings.languageTitle')}</h2>
            </div>
          </header>
          <p>{t('settings.languageHint')}</p>
          <div className="route-page__language-row" style={{ marginTop: '12px' }}>
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
