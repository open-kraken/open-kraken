import type {
  ProjectDataDocument,
  ProjectDataPayload,
  RoadmapDocument,
  RoadmapResponse,
  RoadmapTaskItem,
  ProjectDataResponse
} from './api-client';
import { normalizeProjectDataDocument, normalizeRoadmapDocument, sortRoadmapTasks } from './api-client';

export type PanelPhase = 'idle' | 'loading' | 'loaded' | 'dirty' | 'saving' | 'error';

export type PanelFeedbackTone = 'neutral' | 'loading' | 'saving' | 'error' | 'readonly';

export type PanelFeedback = {
  tone: PanelFeedbackTone;
  titleKey: string;
  /** Server or parse error text (shown as-is). */
  detail?: string;
  /** Fixed UI copy from the message catalog. */
  detailKey?: string;
  warning: string;
  disableInputs: boolean;
  disableSave: boolean;
  disableReload: boolean;
  showReloadChoices: boolean;
};

export type RoadmapEditorState = {
  phase: PanelPhase;
  persisted: RoadmapDocument;
  draft: RoadmapDocument;
  saveError: string | null;
  warning: string;
  storage: 'workspace' | 'app' | 'none';
  version: number;
  readOnlyReason: string | null;
  reloadRequestedWhileDirty: boolean;
};

export type ProjectDataEditorState = {
  phase: PanelPhase;
  persisted: ProjectDataDocument;
  draftText: string;
  draftPayload: ProjectDataPayload;
  parseError: string | null;
  saveError: string | null;
  reloadRequestedWhileDirty: boolean;
};

export const EMPTY_ROADMAP: RoadmapDocument = {
  objective: '',
  tasks: []
};

export const EMPTY_PROJECT_DATA: ProjectDataDocument = {
  payload: {},
  version: 0,
  storage: 'none',
  warning: '',
  readOnlyReason: null
};

/** Canonical English copy surfaced to the UI; matched for i18n in panels. */
export const DEFAULT_READONLY_REASON_EN = 'This roadmap is read-only until the backend unlocks it.';
export const INVALID_JSON_DETAIL_EN = 'Invalid JSON payload.';

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const stableStringify = (value: unknown): string => JSON.stringify(value, null, 2);

const roadmapEqual = (left: RoadmapDocument, right: RoadmapDocument) => stableStringify(left) === stableStringify(right);

const payloadEqual = (left: ProjectDataPayload, right: ProjectDataPayload) => stableStringify(left) === stableStringify(right);

export const createRoadmapEditorState = (): RoadmapEditorState => ({
  phase: 'idle',
  persisted: deepClone(EMPTY_ROADMAP),
  draft: deepClone(EMPTY_ROADMAP),
  saveError: null,
  warning: '',
  storage: 'none',
  version: 0,
  readOnlyReason: null,
  reloadRequestedWhileDirty: false
});

export const createProjectDataEditorState = (): ProjectDataEditorState => ({
  phase: 'idle',
  persisted: deepClone(EMPTY_PROJECT_DATA),
  draftText: stableStringify({}),
  draftPayload: {},
  parseError: null,
  saveError: null,
  reloadRequestedWhileDirty: false
});

export const hydrateRoadmapState = (response: RoadmapResponse): RoadmapEditorState => {
  const roadmap = normalizeRoadmapDocument(response);
  return {
    phase: 'loaded',
    persisted: deepClone(roadmap),
    draft: deepClone(roadmap),
    saveError: null,
    warning: response.warning ?? '',
    storage: response.storage ?? 'workspace',
    version: response.version ?? 0,
    readOnlyReason:
      response.readOnly === true
        ? response.readOnlyReason ?? DEFAULT_READONLY_REASON_EN
        : response.readOnlyReason ?? null,
    reloadRequestedWhileDirty: false
  };
};

export const hydrateProjectDataState = (response: ProjectDataResponse): ProjectDataEditorState => {
  const document = normalizeProjectDataDocument(response);
  return {
    phase: 'loaded',
    persisted: deepClone(document),
    draftText: stableStringify(document.payload),
    draftPayload: deepClone(document.payload),
    parseError: null,
    saveError: null,
    reloadRequestedWhileDirty: false
  };
};

export const updateRoadmapObjective = (state: RoadmapEditorState, objective: string): RoadmapEditorState => {
  if (state.phase === 'loading' || state.phase === 'saving' || state.readOnlyReason) {
    return state;
  }
  const draft = { ...state.draft, objective };
  return {
    ...state,
    draft,
    phase: roadmapEqual(draft, state.persisted) ? 'loaded' : 'dirty',
    saveError: null,
    reloadRequestedWhileDirty: false
  };
};

export const replaceRoadmapTasks = (state: RoadmapEditorState, tasks: RoadmapTaskItem[]): RoadmapEditorState => {
  if (state.phase === 'loading' || state.phase === 'saving' || state.readOnlyReason) {
    return state;
  }
  const draft = { ...state.draft, tasks: deepClone(sortRoadmapTasks(tasks)) };
  return {
    ...state,
    draft,
    phase: roadmapEqual(draft, state.persisted) ? 'loaded' : 'dirty',
    saveError: null,
    reloadRequestedWhileDirty: false
  };
};

export const addRoadmapTask = (state: RoadmapEditorState): RoadmapEditorState => {
  if (state.phase === 'loading' || state.phase === 'saving' || state.readOnlyReason) {
    return state;
  }
  const nextNumber = state.draft.tasks.reduce((max, t) => Math.max(max, t.number), 0) + 1;
  const newTask: RoadmapTaskItem = {
    id: crypto.randomUUID(),
    number: nextNumber,
    title: '',
    status: 'todo',
    pinned: false,
    assigneeId: null,
    teamId: null,
    dependencies: [],
    startedAt: null,
    dueAt: null,
    completedAt: null
  };
  const tasks = [...state.draft.tasks, newTask];
  const draft = { ...state.draft, tasks: deepClone(sortRoadmapTasks(tasks)) };
  return {
    ...state,
    draft,
    phase: 'dirty',
    saveError: null,
    reloadRequestedWhileDirty: false
  };
};

export const removeRoadmapTask = (state: RoadmapEditorState, taskId: string): RoadmapEditorState => {
  if (state.phase === 'loading' || state.phase === 'saving' || state.readOnlyReason) {
    return state;
  }
  const tasks = state.draft.tasks.filter((t) => t.id !== taskId);
  const draft = { ...state.draft, tasks };
  return {
    ...state,
    draft,
    phase: roadmapEqual(draft, state.persisted) ? 'loaded' : 'dirty',
    saveError: null,
    reloadRequestedWhileDirty: false
  };
};

export const reorderRoadmapTask = (state: RoadmapEditorState, taskId: string, direction: 'up' | 'down'): RoadmapEditorState => {
  if (state.phase === 'loading' || state.phase === 'saving' || state.readOnlyReason) {
    return state;
  }
  const sorted = deepClone(sortRoadmapTasks(state.draft.tasks));
  const index = sorted.findIndex((t) => t.id === taskId);
  if (index < 0) return state;
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= sorted.length) return state;
  // Swap number fields to change sort order
  const tempNumber = sorted[index].number;
  sorted[index].number = sorted[swapIndex].number;
  sorted[swapIndex].number = tempNumber;
  const draft = { ...state.draft, tasks: sortRoadmapTasks(sorted) };
  return {
    ...state,
    draft,
    phase: roadmapEqual(draft, state.persisted) ? 'loaded' : 'dirty',
    saveError: null,
    reloadRequestedWhileDirty: false
  };
};

export const updateProjectDataDraftText = (state: ProjectDataEditorState, draftText: string): ProjectDataEditorState => {
  if (state.phase === 'loading' || state.phase === 'saving' || state.persisted.readOnlyReason) {
    return state;
  }

  try {
    const parsed = JSON.parse(draftText) as ProjectDataPayload;
    const dirty = !payloadEqual(parsed, state.persisted.payload);
    return {
      ...state,
      draftText,
      draftPayload: parsed,
      parseError: null,
      saveError: null,
      phase: dirty ? 'dirty' : 'loaded',
      reloadRequestedWhileDirty: false
    };
  } catch (error) {
    return {
      ...state,
      draftText,
      parseError: error instanceof Error ? error.message : INVALID_JSON_DETAIL_EN,
      saveError: null,
      phase: 'dirty',
      reloadRequestedWhileDirty: false
    };
  }
};

export const requestReload = <T extends { phase: PanelPhase; reloadRequestedWhileDirty: boolean }>(
  state: T
): T => {
  if (state.phase === 'dirty' || state.phase === 'error') {
    return {
      ...state,
      reloadRequestedWhileDirty: true
    };
  }
  return state;
};

export const clearReloadRequest = <T extends { reloadRequestedWhileDirty: boolean }>(state: T): T => ({
  ...state,
  reloadRequestedWhileDirty: false
});

export const markRoadmapLoading = (state: RoadmapEditorState): RoadmapEditorState => ({
  ...state,
  phase: 'loading',
  saveError: null,
  reloadRequestedWhileDirty: false
});

export const markProjectDataLoading = (state: ProjectDataEditorState): ProjectDataEditorState => ({
  ...state,
  phase: 'loading',
  saveError: null,
  reloadRequestedWhileDirty: false
});

export const markRoadmapSaving = (state: RoadmapEditorState): RoadmapEditorState => ({
  ...state,
  phase: 'saving',
  saveError: null
});

export const markProjectDataSaving = (state: ProjectDataEditorState): ProjectDataEditorState => ({
  ...state,
  phase: 'saving',
  saveError: null
});

export const applyRoadmapSaveSuccess = (response: RoadmapResponse): RoadmapEditorState => hydrateRoadmapState(response);

export const applyProjectDataSaveSuccess = (response: ProjectDataResponse): ProjectDataEditorState =>
  hydrateProjectDataState(response);

export const applyRoadmapSaveFailure = (state: RoadmapEditorState, message: string): RoadmapEditorState => ({
  ...state,
  phase: 'error',
  saveError: message,
  reloadRequestedWhileDirty: false
});

export const applyProjectDataSaveFailure = (state: ProjectDataEditorState, message: string): ProjectDataEditorState => ({
  ...state,
  phase: 'error',
  saveError: message,
  reloadRequestedWhileDirty: false
});

export const selectPanelFeedback = ({
  phase,
  warning,
  readOnlyReason,
  saveError,
  parseError,
  reloadRequestedWhileDirty
}: {
  phase: PanelPhase;
  warning: string;
  readOnlyReason: string | null;
  saveError?: string | null;
  parseError?: string | null;
  reloadRequestedWhileDirty: boolean;
}): PanelFeedback => {
  if (saveError || parseError) {
    return {
      tone: 'error',
      titleKey: 'panel.feedback.actionRequired',
      detail: (saveError ?? parseError) as string,
      warning,
      disableInputs: false,
      disableSave: Boolean(parseError),
      disableReload: false,
      showReloadChoices: reloadRequestedWhileDirty
    };
  }

  if (phase === 'loading') {
    return {
      tone: 'loading',
      titleKey: 'panel.feedback.loadingTitle',
      detailKey: 'panel.feedback.loadingDetail',
      warning,
      disableInputs: true,
      disableSave: true,
      disableReload: true,
      showReloadChoices: false
    };
  }

  if (phase === 'saving') {
    return {
      tone: 'saving',
      titleKey: 'panel.feedback.savingTitle',
      detailKey: 'panel.feedback.savingDetail',
      warning,
      disableInputs: true,
      disableSave: true,
      disableReload: true,
      showReloadChoices: false
    };
  }

  if (readOnlyReason) {
    return {
      tone: 'readonly',
      titleKey: 'panel.feedback.readonlyTitle',
      detail: readOnlyReason,
      warning,
      disableInputs: true,
      disableSave: true,
      disableReload: false,
      showReloadChoices: false
    };
  }

  if (reloadRequestedWhileDirty) {
    return {
      tone: 'neutral',
      titleKey: 'panel.feedback.unsavedTitle',
      detailKey: 'panel.feedback.unsavedDetail',
      warning,
      disableInputs: false,
      disableSave: false,
      disableReload: false,
      showReloadChoices: true
    };
  }

  return {
    tone: 'neutral',
    titleKey: 'panel.feedback.readyTitle',
    detailKey: 'panel.feedback.readyDetail',
    warning,
    disableInputs: false,
    disableSave: phase !== 'dirty',
    disableReload: false,
    showReloadChoices: false
  };
};
