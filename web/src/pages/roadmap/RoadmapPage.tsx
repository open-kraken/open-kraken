import { useEffect, useMemo, useRef } from 'react';
import { RoadmapProjectDataRoute } from '@/routes/roadmap-project-data';
import type { RoadmapProjectDataClient } from '@/features/roadmap-project-data/api-client';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { useAppShell } from '@/state/app-shell-store';

export const RoadmapPage = () => {
  const { t } = useI18n();
  const { apiClient, notifications, pushNotification, realtime, route } = useAppShell();
  const lastErrorRef = useRef<string | null>(null);

  const roadmapClient = useMemo<RoadmapProjectDataClient>(
    () => ({
      getRoadmap: async () => {
        const response = await apiClient.getRoadmapDocument();
        return {
          readOnly: response.readOnly ?? false,
          storage: response.storage,
          warning: response.warning,
          readOnlyReason: response.readOnlyReason ?? undefined,
          roadmap: response.roadmap
        };
      },
      updateRoadmap: async (roadmap) => {
        const response = await apiClient.updateRoadmapDocument({ readOnly: false, roadmap });
        return {
          readOnly: response.readOnly ?? false,
          storage: response.storage,
          warning: response.warning,
          readOnlyReason: response.readOnlyReason ?? undefined,
          roadmap: response.roadmap
        };
      },
      getProjectData: () => apiClient.getProjectDataDocument(),
      updateProjectData: (payload) => apiClient.updateProjectDataDocument(payload)
    }),
    [apiClient]
  );

  const handlePageError = (message: string | null) => {
    if (!message || lastErrorRef.current === message) {
      return;
    }
    lastErrorRef.current = message;
    pushNotification({
      tone: 'error',
      title: t('roadmap.errorTitle'),
      detail: message,
      tag: 'roadmap-route-error'
    });
  };

  useEffect(() => {
    if (!notifications.some((toast) => toast.tag === 'roadmap-route-error')) {
      lastErrorRef.current = null;
    }
  }, [notifications]);

  return (
    <section className="page-card roadmap-route-page" data-route-page="roadmap" data-page-entry="roadmap-runtime">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('roadmap.eyebrow')}</p>
          <h1>{t('roadmap.title')}</h1>
          <p className="route-page__intro">
            {t('roadmap.introBefore')} <code>{route.path}</code> {t('roadmap.introAfter')}
          </p>
        </div>

        <div className="route-page__metric-strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('roadmap.metric.nav')}</span>
            <strong>{t(`routes.${route.id}.label`)}</strong>
            <small>{t('roadmap.metric.navHint')}</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('roadmap.metric.realtime')}</span>
            <strong>{translateRealtimeStatusLabel(realtime.status, t)}</strong>
            <small>{translateRealtimeDetail(realtime.detail, t)}</small>
          </article>
        </div>
      </div>

      <RoadmapProjectDataRoute client={roadmapClient} onPageError={handlePageError} />
    </section>
  );
};
