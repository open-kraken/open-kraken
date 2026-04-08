/**
 * Roadmap + project data — first-class AppShell route (do not remove / 勿删).
 * RoadmapPanel and ProjectDataPanel share the same load, save, read-only lock,
 * reload-conflict handling, and error feedback semantics (aligned with backend contract).
 */
import React, { startTransition, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { createApiClient } from '../api/create-client';
import { appEnv, resolveBrowserApiBaseUrl, resolveBrowserWsBaseUrl } from '@/config/env';
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
  addRoadmapTask,
  removeRoadmapTask,
  reorderRoadmapTask,
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
      OPEN_KRAKEN_API_BASE_URL: resolveBrowserApiBaseUrl(),
      OPEN_KRAKEN_WS_BASE_URL: resolveBrowserWsBaseUrl(),
      OPEN_KRAKEN_WORKSPACE_ID: appEnv.defaultWorkspaceId
    }
  }) as RoadmapProjectDataClient;

const updateTaskList = (tasks: RoadmapTaskItem[], taskId: string, patch: Partial<RoadmapTaskItem>) =>
  tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task));

export const RoadmapProjectDataRoute = ({ client, onPageError }: RoadmapProjectDataRouteProps) => {
  const { t } = useI18n();
  const { apiClient } = useAppShell();
  const resolvedClient = useMemo(() => client ?? createDefaultClient(), [client]);
  const [roadmapState, setRoadmapState] = useState(() => createRoadmapEditorState());
  const [projectDataState, setProjectDataState] = useState(() => createProjectDataEditorState());
  const [pageError, setPageError] = useState<string | null>(null);
  const [members, setMembers] = useState<Array<{ memberId: string; displayName?: string }>>([]);

  useEffect(() => {
    void apiClient.getMembers().then((res) => {
      setMembers((res.members ?? []).map((m) => ({ memberId: m.memberId, displayName: m.displayName })));
    }).catch(() => {});
  }, [apiClient]);

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
    <div className="roadmap-workspace" role="region" aria-label={t('routes.roadmap.label')}>
      {pageError ? (
        <p className="roadmap-workspace__page-error" role="alert">
          {t('roadmap.pageLoadError', { message: pageError })}
        </p>
      ) : null}

      <div className="roadmap-workspace__grid">
        <RoadmapPanel
          value={roadmapState.draft}
          feedback={roadmapFeedback}
          members={members}
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
          onAddTask={() => setRoadmapState((current) => addRoadmapTask(current))}
          onDeleteTask={(taskId) => setRoadmapState((current) => removeRoadmapTask(current, taskId))}
          onMoveTask={(taskId, direction) => setRoadmapState((current) => reorderRoadmapTask(current, taskId, direction))}
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
    </div>
  );
};
