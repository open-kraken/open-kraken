/**
 * v2 API client — Flow and Step endpoints.
 */

import { v2Fetch } from './client';
import type { FlowDTO, StepDTO, CreateFlowInput, CreateStepInput } from './types';

export const createFlow = (input: CreateFlowInput): Promise<FlowDTO> =>
  v2Fetch<FlowDTO>('flows', { method: 'POST', body: input });

export const getFlowSteps = (flowId: string): Promise<StepDTO[]> =>
  v2Fetch<StepDTO[]>(`flows/${encodeURIComponent(flowId)}/steps`);

export const createStep = (input: CreateStepInput): Promise<StepDTO> =>
  v2Fetch<StepDTO>('steps', { method: 'POST', body: input });

export const getStep = (id: string): Promise<StepDTO> =>
  v2Fetch<StepDTO>(`steps/${encodeURIComponent(id)}`);

export interface ListPendingStepsParams {
  tenant_id?: string;
  limit?: number;
}

export const listPendingSteps = (params: ListPendingStepsParams = {}): Promise<StepDTO[]> => {
  const qs = new URLSearchParams();
  if (params.tenant_id) qs.set('tenant_id', params.tenant_id);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<StepDTO[]>(`steps/pending${query ? `?${query}` : ''}`);
};
