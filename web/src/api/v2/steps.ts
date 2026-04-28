/**
 * v2 API client — Flow and Step endpoints.
 */

import { v2Fetch } from './client';
import type { FlowDTO, StepDTO, CreateFlowInput, CreateStepInput } from './types';

const unwrapItems = <T>(value: T[] | { items?: T[] }): T[] => {
  if (Array.isArray(value)) return value;
  return value.items ?? [];
};

type RawFlowDTO = Partial<FlowDTO> & {
  runId?: string;
  tenantId?: string;
  agentRole?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RawStepDTO = Partial<StepDTO> & {
  flowId?: string;
  runId?: string;
  tenantId?: string;
  workloadClass?: string;
  agentType?: string;
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

const normalizeStep = (step: RawStepDTO): StepDTO => ({
  id: step.id ?? '',
  flow_id: step.flow_id ?? step.flowId ?? '',
  run_id: step.run_id ?? step.runId ?? '',
  tenant_id: step.tenant_id ?? step.tenantId ?? '',
  workload_class: step.workload_class ?? step.workloadClass ?? '',
  regime: step.regime ?? 'OPAQUE',
  agent_type: step.agent_type ?? step.agentType ?? '',
  provider: step.provider ?? '',
  state: step.state ?? 'pending',
  created_at: step.created_at ?? step.createdAt ?? '',
  updated_at: step.updated_at ?? step.updatedAt ?? '',
  side_effects: step.side_effects,
});

export const createFlow = (input: CreateFlowInput): Promise<FlowDTO> =>
  v2Fetch<RawFlowDTO>('flows', { method: 'POST', body: input }).then(normalizeFlow);

export const getFlowSteps = (flowId: string): Promise<StepDTO[]> =>
  v2Fetch<RawStepDTO[] | { items?: RawStepDTO[] }>(`flows/${encodeURIComponent(flowId)}/steps`)
    .then(unwrapItems)
    .then((items) => items.map(normalizeStep));

export const createStep = (input: CreateStepInput): Promise<StepDTO> =>
  v2Fetch<RawStepDTO>('steps', { method: 'POST', body: input }).then(normalizeStep);

export const getStep = (id: string): Promise<StepDTO> =>
  v2Fetch<RawStepDTO>(`steps/${encodeURIComponent(id)}`).then(normalizeStep);

export interface ListPendingStepsParams {
  tenant_id?: string;
  limit?: number;
}

export const listPendingSteps = (params: ListPendingStepsParams = {}): Promise<StepDTO[]> => {
  const qs = new URLSearchParams();
  if (params.tenant_id) qs.set('tenant_id', params.tenant_id);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<RawStepDTO[] | { items?: RawStepDTO[] }>(`steps/pending${query ? `?${query}` : ''}`)
    .then(unwrapItems)
    .then((items) => items.map(normalizeStep));
};
