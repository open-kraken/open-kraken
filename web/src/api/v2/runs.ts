/**
 * v2 API client — Run endpoints.
 */

import { v2Fetch } from './client';
import type { RunDTO, FlowDTO, CreateRunInput, RunState } from './types';

export interface ListRunsParams {
  tenant_id?: string;
  state?: RunState;
  limit?: number;
}

const unwrapItems = <T>(value: T[] | { items?: T[] }): T[] => {
  if (Array.isArray(value)) return value;
  return value.items ?? [];
};

type RawRunDTO = Partial<RunDTO> & {
  tenantId?: string;
  hiveId?: string;
  tokenBudget?: number;
  tokensUsed?: number;
  createdAt?: string;
  updatedAt?: string;
  flows?: RawFlowDTO[];
};

type RawFlowDTO = Partial<FlowDTO> & {
  runId?: string;
  tenantId?: string;
  agentRole?: string;
  createdAt?: string;
  updatedAt?: string;
};

const normalizeFlow = (flow: RawFlowDTO): FlowDTO => ({
  id: flow.id ?? '',
  run_id: flow.run_id ?? flow.runId ?? '',
  tenant_id: flow.tenant_id ?? flow.tenantId ?? '',
  agent_role: flow.agent_role ?? flow.agentRole ?? '',
  state: flow.state ?? 'pending',
  created_at: flow.created_at ?? flow.createdAt ?? '',
  updated_at: flow.updated_at ?? flow.updatedAt ?? '',
  steps: flow.steps,
});

const normalizeRun = (run: RawRunDTO): RunDTO => ({
  id: run.id ?? '',
  tenant_id: run.tenant_id ?? run.tenantId ?? '',
  hive_id: run.hive_id ?? run.hiveId ?? '',
  objective: run.objective ?? '',
  state: run.state ?? 'pending',
  token_budget: run.token_budget ?? run.tokenBudget ?? 0,
  tokens_used: run.tokens_used ?? run.tokensUsed ?? 0,
  created_at: run.created_at ?? run.createdAt ?? '',
  updated_at: run.updated_at ?? run.updatedAt ?? '',
  flows: run.flows?.map(normalizeFlow),
});

export const listRuns = (params: ListRunsParams = {}): Promise<RunDTO[]> => {
  const qs = new URLSearchParams();
  if (params.tenant_id) qs.set('tenant_id', params.tenant_id);
  if (params.state) qs.set('state', params.state);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<RawRunDTO[] | { items?: RawRunDTO[] }>(`runs${query ? `?${query}` : ''}`)
    .then(unwrapItems)
    .then((items) => items.map(normalizeRun));
};

export const getRun = (id: string): Promise<RunDTO> =>
  v2Fetch<RawRunDTO>(`runs/${encodeURIComponent(id)}`).then(normalizeRun);

export const createRun = (input: CreateRunInput): Promise<RunDTO> =>
  v2Fetch<RawRunDTO>('runs', { method: 'POST', body: input }).then(normalizeRun);

export const updateRunState = (id: string, state: RunState): Promise<RunDTO> =>
  v2Fetch<RawRunDTO>(`runs/${encodeURIComponent(id)}/state`, {
    method: 'PUT',
    body: { state },
  }).then(normalizeRun);

export const listRunFlows = (runId: string): Promise<FlowDTO[]> =>
  v2Fetch<RawFlowDTO[] | { items?: RawFlowDTO[] }>(`runs/${encodeURIComponent(runId)}/flows`)
    .then(unwrapItems)
    .then((items) => items.map(normalizeFlow));
