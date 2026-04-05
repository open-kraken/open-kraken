import { useEffect, useMemo, useRef } from 'react';
import { RoadmapProjectDataRoute } from '@/routes/roadmap-project-data';
import type { RoadmapProjectDataClient } from '@/features/roadmap-project-data/api-client';
import { useAppShell } from '@/state/app-shell-store';

export const RoadmapPage = () => {
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
      title: 'Roadmap route error',
      detail: message
    });
  };

  useEffect(() => {
    if (!notifications.some((toast) => toast.title === 'Roadmap route error')) {
      lastErrorRef.current = null;
    }
  }, [notifications]);

  return (
    <section className="page-card roadmap-route-page" data-route-page="roadmap" data-page-entry="roadmap-runtime">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">Roadmap</p>
          <h1>Roadmap and project data stream</h1>
          <p className="route-page__intro">
            This page is the formal <code>{route.path}</code> entry inside AppShell navigation. Document-level
            save, read-only, and conflict feedback stays inside the two panels below, while escalated route
            failures are mirrored into the shell notice outlet above.
          </p>
        </div>

        <div className="route-page__metric-strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">Navigation</span>
            <strong>{route.label}</strong>
            <small>Entered from the primary AppShell nav, not from the legacy collaboration-only entry.</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">Shell realtime</span>
            <strong>{realtime.status}</strong>
            <small>{realtime.detail}</small>
          </article>
        </div>
      </div>

      <RoadmapProjectDataRoute client={roadmapClient} onPageError={handlePageError} />
    </section>
  );
};
