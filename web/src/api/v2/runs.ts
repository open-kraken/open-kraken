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

export const listRuns = (params: ListRunsParams = {}): Promise<RunDTO[]> => {
  const qs = new URLSearchParams();
  if (params.tenant_id) qs.set('tenant_id', params.tenant_id);
  if (params.state) qs.set('state', params.state);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<RunDTO[]>(`runs${query ? `?${query}` : ''}`);
};

export const getRun = (id: string): Promise<RunDTO> =>
  v2Fetch<RunDTO>(`runs/${encodeURIComponent(id)}`);

export const createRun = (input: CreateRunInput): Promise<RunDTO> =>
  v2Fetch<RunDTO>('runs', { method: 'POST', body: input });

export const updateRunState = (id: string, state: RunState): Promise<RunDTO> =>
  v2Fetch<RunDTO>(`runs/${encodeURIComponent(id)}/state`, {
    method: 'PUT',
    body: { state },
  });

export const listRunFlows = (runId: string): Promise<FlowDTO[]> =>
  v2Fetch<FlowDTO[]>(`runs/${encodeURIComponent(runId)}/flows`);
