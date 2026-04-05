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
  title: string;
  detail: string;
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
  storage: 'none',
  warning: '',
  readOnlyReason: null
};

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
    readOnlyReason:
      response.readOnly === true
        ? response.readOnlyReason ?? 'This roadmap is read-only until the backend unlocks it.'
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
      parseError: error instanceof Error ? error.message : 'Invalid JSON payload.',
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
      title: 'Action required',
      detail: saveError ?? parseError ?? 'The latest change could not be stored.',
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
      title: 'Loading from backend',
      detail: 'Inputs stay disabled until the latest persisted state is ready.',
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
      title: 'Saving changes',
      detail: 'Repeated submit is locked until the current write finishes.',
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
      title: 'Read-only source',
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
      title: 'Unsaved local edits',
      detail: 'Keep the draft to continue editing, or discard it and reload the backend copy.',
      warning,
      disableInputs: false,
      disableSave: false,
      disableReload: false,
      showReloadChoices: true
    };
  }

  return {
    tone: 'neutral',
    title: 'Ready',
    detail: 'Edits stay local until you explicitly save them.',
    warning,
    disableInputs: false,
    disableSave: phase !== 'dirty',
    disableReload: false,
    showReloadChoices: false
  };
};
