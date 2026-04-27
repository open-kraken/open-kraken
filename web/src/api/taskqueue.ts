import { getHttpClient } from '@/api/http-binding';

export type QueueTaskStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retrying'
  | string;

export type QueueTask = {
  id: string;
  idempotencyKey: string;
  workspaceId: string;
  type: string;
  payload: string;
  priority: number;
  status: QueueTaskStatus;
  nodeId: string;
  agentId: string;
  queue: string;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  result: string;
  timeoutMs: number;
  createdAt: number;
  updatedAt: number;
  claimedAt?: number;
  startedAt?: number;
  completedAt?: number;
};

export type ListQueueTasksInput = {
  workspaceId?: string;
  status?: string;
  queue?: string;
  nodeId?: string;
  type?: string;
};

export type CreateQueueTaskInput = {
  idempotencyKey?: string;
  workspaceId?: string;
  type: string;
  payload: string;
  priority?: number;
  queue?: string;
  maxAttempts?: number;
  timeoutMs?: number;
};

const asNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const mapTask = (raw: Record<string, unknown>): QueueTask => ({
  id: String(raw.id ?? ''),
  idempotencyKey: String(raw.idempotencyKey ?? ''),
  workspaceId: String(raw.workspaceId ?? ''),
  type: String(raw.type ?? ''),
  payload: String(raw.payload ?? ''),
  priority: asNumber(raw.priority),
  status: String(raw.status ?? 'pending'),
  nodeId: String(raw.nodeId ?? ''),
  agentId: String(raw.agentId ?? ''),
  queue: String(raw.queue ?? 'default'),
  attempts: asNumber(raw.attempts),
  maxAttempts: asNumber(raw.maxAttempts),
  lastError: String(raw.lastError ?? ''),
  result: String(raw.result ?? ''),
  timeoutMs: asNumber(raw.timeoutMs),
  createdAt: asNumber(raw.createdAt),
  updatedAt: asNumber(raw.updatedAt),
  claimedAt: raw.claimedAt === undefined ? undefined : asNumber(raw.claimedAt),
  startedAt: raw.startedAt === undefined ? undefined : asNumber(raw.startedAt),
  completedAt: raw.completedAt === undefined ? undefined : asNumber(raw.completedAt),
});

const queryString = (input: ListQueueTasksInput = {}) => {
  const params = new URLSearchParams();
  if (input.workspaceId) params.set('workspaceId', input.workspaceId);
  if (input.status) params.set('status', input.status);
  if (input.queue) params.set('queue', input.queue);
  if (input.nodeId) params.set('nodeId', input.nodeId);
  if (input.type) params.set('type', input.type);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const listQueueTasks = async (input: ListQueueTasksInput = {}): Promise<QueueTask[]> => {
  const http = getHttpClient();
  const body = await http.get<{ items?: Record<string, unknown>[] }>(`/queue/tasks${queryString(input)}`);
  return (body.items ?? []).map(mapTask).filter((task) => task.id);
};

export const createQueueTask = async (input: CreateQueueTaskInput): Promise<QueueTask> => {
  const http = getHttpClient();
  const body = await http.post<{ task?: Record<string, unknown> }>('/queue/tasks', {
    idempotencyKey: input.idempotencyKey ?? '',
    workspaceId: input.workspaceId ?? http.workspaceId,
    type: input.type,
    payload: input.payload,
    priority: input.priority ?? 2,
    queue: input.queue ?? 'default',
    maxAttempts: input.maxAttempts ?? 3,
    timeoutMs: input.timeoutMs ?? 0,
  });
  return mapTask(body.task ?? {});
};

export const claimQueueTask = async (queue: string, nodeId: string): Promise<QueueTask> => {
  const http = getHttpClient();
  const raw = await http.post<Record<string, unknown>>('/queue/claim', { queue, nodeId });
  return mapTask(raw);
};

export const claimQueueTaskById = async (taskId: string, nodeId: string, agentId = ''): Promise<QueueTask> => {
  const http = getHttpClient();
  const raw = await http.post<Record<string, unknown>>(`/queue/tasks/${encodeURIComponent(taskId)}/claim`, { nodeId, agentId });
  return mapTask(raw);
};

export const startQueueTask = async (taskId: string, nodeId: string): Promise<QueueTask> => {
  const http = getHttpClient();
  const raw = await http.post<Record<string, unknown>>(`/queue/tasks/${encodeURIComponent(taskId)}/start`, { nodeId });
  return mapTask(raw);
};

export const ackQueueTask = async (taskId: string, nodeId: string, result = ''): Promise<QueueTask> => {
  const http = getHttpClient();
  const raw = await http.post<Record<string, unknown>>(`/queue/tasks/${encodeURIComponent(taskId)}/ack`, {
    nodeId,
    result,
  });
  return mapTask(raw);
};

export const nackQueueTask = async (taskId: string, nodeId: string, error = 'Marked failed from task map'): Promise<QueueTask> => {
  const http = getHttpClient();
  const raw = await http.post<Record<string, unknown>>(`/queue/tasks/${encodeURIComponent(taskId)}/nack`, {
    nodeId,
    error,
  });
  return mapTask(raw);
};

export const cancelQueueTask = async (taskId: string): Promise<QueueTask> => {
  const http = getHttpClient();
  const raw = await http.request<Record<string, unknown>>(`/queue/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  return mapTask(raw);
};
