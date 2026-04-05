import React, { startTransition, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { createApiClient } from '../api/create-client.mjs';
import { ProjectDataPanel } from '../features/roadmap-project-data/components/ProjectDataPanel';
import { RoadmapPanel } from '../features/roadmap-project-data/components/RoadmapPanel';
import type {
  ProjectDataResponse,
  RoadmapProjectDataClient,
  RoadmapResponse,
  RoadmapTaskItem
} from '../features/roadmap-project-data/api-client';
import {
  applyProjectDataSaveFailure,
  applyProjectDataSaveSuccess,
  applyRoadmapSaveFailure,
  applyRoadmapSaveSuccess,
  clearReloadRequest,
  createProjectDataEditorState,
  createRoadmapEditorState,
  hydrateProjectDataState,
  hydrateRoadmapState,
  markProjectDataLoading,
  markProjectDataSaving,
  markRoadmapLoading,
  markRoadmapSaving,
  replaceRoadmapTasks,
  requestReload,
  selectPanelFeedback,
  updateProjectDataDraftText,
  updateRoadmapObjective
} from '../features/roadmap-project-data/store';

export type RoadmapProjectDataApi = {
  getRoadmap: () => Promise<RoadmapResponse>;
  updateRoadmap: (roadmap: RoadmapResponse['roadmap']) => Promise<RoadmapResponse>;
  getProjectData: () => Promise<ProjectDataResponse>;
  updateProjectData: (payload: { readOnly: boolean; payload: Record<string, unknown> }) => Promise<ProjectDataResponse>;
};

export type RoadmapProjectDataRouteProps = {
  client?: RoadmapProjectDataClient;
  onPageError?: (message: string | null) => void;
};

const createDefaultClient = (): RoadmapProjectDataClient =>
  createApiClient({
    env: {
      OPEN_KRAKEN_API_MODE: 'mock',
      OPEN_KRAKEN_WORKSPACE_ID: 'ws_open_kraken'
    }
  }) as RoadmapProjectDataClient;

const updateTaskList = (tasks: RoadmapTaskItem[], taskId: string, patch: Partial<RoadmapTaskItem>) =>
  tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task));

export const RoadmapProjectDataRoute = ({ client, onPageError }: RoadmapProjectDataRouteProps) => {
  const { t } = useI18n();
  const resolvedClient = useMemo(() => client ?? createDefaultClient(), [client]);
  const [roadmapState, setRoadmapState] = useState(() => createRoadmapEditorState());
  const [projectDataState, setProjectDataState] = useState(() => createProjectDataEditorState());
  const [pageError, setPageError] = useState<string | null>(null);

  const loadAll = async () => {
    setRoadmapState((current) => markRoadmapLoading(current));
    setProjectDataState((current) => markProjectDataLoading(current));
    setPageError(null);

    try {
      const [roadmapResponse, projectDataResponse] = await Promise.all([
        resolvedClient.getRoadmap(),
        resolvedClient.getProjectData()
      ]);
      startTransition(() => {
        setRoadmapState(hydrateRoadmapState(roadmapResponse));
        setProjectDataState(hydrateProjectDataState(projectDataResponse));
        onPageError?.(null);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('roadmap.loadFailed');
      startTransition(() => {
        setPageError(message);
        setRoadmapState((current) => applyRoadmapSaveFailure(current, message));
        setProjectDataState((current) => applyProjectDataSaveFailure(current, message));
        onPageError?.(message);
      });
    }
  };

  useEffect(() => {
    void loadAll();
    // Intentionally reload only when the API client identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedClient]);

  const handleRoadmapSave = async () => {
    setRoadmapState((current) => markRoadmapSaving(current));
    try {
      const response = await resolvedClient.updateRoadmap(roadmapState.draft);
      startTransition(() => {
        setRoadmapState(applyRoadmapSaveSuccess(response));
        onPageError?.(null);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('roadmap.saveFailed');
      startTransition(() => {
        setRoadmapState((current) => applyRoadmapSaveFailure(current, message));
        onPageError?.(message);
      });
    }
  };

  const handleProjectDataSave = async () => {
    if (projectDataState.parseError) {
      return;
    }
    setProjectDataState((current) => markProjectDataSaving(current));
    try {
      const response = await resolvedClient.updateProjectData({
        readOnly: false,
        payload: projectDataState.draftPayload
      });
      startTransition(() => {
        setProjectDataState(applyProjectDataSaveSuccess(response));
        onPageError?.(null);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('roadmap.projectSaveFailed');
      startTransition(() => {
        setProjectDataState((current) => applyProjectDataSaveFailure(current, message));
        onPageError?.(message);
      });
    }
  };

  const roadmapFeedback = selectPanelFeedback({
    phase: roadmapState.phase,
    warning: roadmapState.warning,
    readOnlyReason: roadmapState.readOnlyReason,
    saveError: roadmapState.saveError,
    reloadRequestedWhileDirty: roadmapState.reloadRequestedWhileDirty
  });

  const projectDataFeedback = selectPanelFeedback({
    phase: projectDataState.phase,
    warning: projectDataState.persisted.warning,
    readOnlyReason: projectDataState.persisted.readOnlyReason,
    saveError: projectDataState.saveError,
    parseError: projectDataState.parseError,
    reloadRequestedWhileDirty: projectDataState.reloadRequestedWhileDirty
  });

  return (
    <section className="roadmap-project-route" aria-label="roadmap-project-data-route">
      <header className="roadmap-project-route__header">
        <div>
          <p className="collaboration-overview-page__eyebrow">{t('roadmap.routeHeaderEyebrow')}</p>
          <h2 className="roadmap-project-route__headline">{t('roadmap.routeHeaderTitle')}</h2>
          <p className="collaboration-overview-page__intro">{t('roadmap.routeHeaderIntro')}</p>
        </div>
        {pageError ? (
          <p className="roadmap-project-route__page-error">{t('roadmap.pageLoadError', { message: pageError })}</p>
        ) : null}
      </header>

      <div className="roadmap-project-route__grid">
        <RoadmapPanel
          value={roadmapState.draft}
          feedback={roadmapFeedback}
          onObjectiveChange={(value) => setRoadmapState((current) => updateRoadmapObjective(current, value))}
          onTaskChange={(taskId, patch) =>
            setRoadmapState((current) => replaceRoadmapTasks(current, updateTaskList(current.draft.tasks, taskId, patch)))
          }
          onSave={() => void handleRoadmapSave()}
          onReload={() =>
            setRoadmapState((current) => {
              const next = requestReload(current);
              if (next.reloadRequestedWhileDirty) {
                return next;
              }
              void loadAll();
              return next;
            })
          }
          onKeepDraft={() => setRoadmapState((current) => clearReloadRequest(current))}
          onDiscardAndReload={() => {
            setRoadmapState((current) => clearReloadRequest(current));
            void loadAll();
          }}
        />

        <ProjectDataPanel
          value={projectDataState.persisted}
          draftText={projectDataState.draftText}
          feedback={projectDataFeedback}
          onDraftChange={(value) => setProjectDataState((current) => updateProjectDataDraftText(current, value))}
          onSave={() => void handleProjectDataSave()}
          onReload={() =>
            setProjectDataState((current) => {
              const next = requestReload(current);
              if (next.reloadRequestedWhileDirty) {
                return next;
              }
              void loadAll();
              return next;
            })
          }
          onKeepDraft={() => setProjectDataState((current) => clearReloadRequest(current))}
          onDiscardAndReload={() => {
            setProjectDataState((current) => clearReloadRequest(current));
            void loadAll();
          }}
        />
      </div>
    </section>
  );
};
