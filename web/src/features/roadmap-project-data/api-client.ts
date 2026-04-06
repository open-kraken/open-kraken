export type RoadmapTaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'draft' | string;

export type RoadmapTaskItem = {
  id: string;
  number: number;
  title: string;
  status: RoadmapTaskStatus;
  pinned: boolean;
  assigneeId?: string | null;
};

export type RoadmapDocument = {
  objective: string;
  tasks: RoadmapTaskItem[];
};

export type RoadmapResponse = {
  readOnly: boolean;
  warning?: string;
  storage?: 'workspace' | 'app' | 'none';
  readOnlyReason?: string;
  roadmap: {
    objective?: string;
    tasks?: Array<Partial<RoadmapTaskItem> & { order?: number }>;
  };
};

export type ProjectDataPayload = Record<string, unknown>;

export type ProjectDataDocument = {
  payload: ProjectDataPayload;
  storage: 'workspace' | 'app' | 'none';
  warning: string;
  readOnlyReason: string | null;
};

export type ProjectDataResponse = {
  readOnly?: boolean;
  storage?: 'workspace' | 'app' | 'none';
  warning?: string;
  readOnlyReason?: string | null;
  payload?: ProjectDataPayload;
};

export type RoadmapProjectDataClient = {
  getRoadmap: () => Promise<RoadmapResponse>;
  updateRoadmap: (roadmap: RoadmapResponse['roadmap']) => Promise<RoadmapResponse>;
  getProjectData: () => Promise<ProjectDataResponse>;
  updateProjectData: (payload: { readOnly: boolean; payload: ProjectDataPayload }) => Promise<ProjectDataResponse>;
};

const compareTasks = (left: RoadmapTaskItem, right: RoadmapTaskItem) => {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }
  if (left.number !== right.number) {
    return left.number - right.number;
  }
  return left.id.localeCompare(right.id);
};

export const sortRoadmapTasks = (tasks: RoadmapTaskItem[]): RoadmapTaskItem[] => [...tasks].sort(compareTasks);

export const normalizeRoadmapDocument = (response: RoadmapResponse): RoadmapDocument => {
  const tasks = (response.roadmap.tasks ?? []).map((task, index) => ({
    id: String(task.id ?? `task_${index + 1}`),
    number:
      typeof task.number === 'number'
        ? task.number
        : typeof task.order === 'number'
          ? task.order
          : index + 1,
    title: String(task.title ?? ''),
    status: String(task.status ?? 'todo'),
    pinned: Boolean(task.pinned),
    assigneeId: (task as Record<string, unknown>).assigneeId as string | null ?? null
  }));

  return {
    objective: String(response.roadmap.objective ?? ''),
    tasks: sortRoadmapTasks(tasks)
  };
};

export const normalizeProjectDataDocument = (response: ProjectDataResponse): ProjectDataDocument => ({
  payload: response.payload ?? {},
  storage: response.storage ?? 'none',
  warning: response.warning ?? '',
  readOnlyReason:
    response.readOnly === true
      ? response.readOnlyReason ?? 'This document is read-only until the backend clears the lock.'
      : response.readOnlyReason ?? null
});
