/**
 * TypeScript interfaces matching the v2 backend DTOs.
 */

export type RunState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RunDTO {
  id: string;
  tenant_id: string;
  hive_id: string;
  objective: string;
  state: RunState;
  token_budget: number;
  tokens_used: number;
  created_at: string;
  updated_at: string;
  flows?: FlowDTO[];
}

export interface FlowDTO {
  id: string;
  run_id: string;
  tenant_id: string;
  agent_role: string;
  state: string;
  created_at: string;
  updated_at: string;
  steps?: StepDTO[];
}

export interface StepDTO {
  id: string;
  flow_id: string;
  run_id: string;
  tenant_id: string;
  workload_class: string;
  regime: string;
  agent_type: string;
  provider: string;
  state: string;
  created_at: string;
  updated_at: string;
  side_effects?: SideEffectDTO[];
}

export interface SideEffectDTO {
  id: string;
  step_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SkillDefinitionDTO {
  id: string;
  name: string;
  version: string;
  description: string;
  prompt_template: string;
  tenant_id: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface ProcessTemplateDTO {
  id: string;
  name: string;
  trigger_description: string;
  dag_template: Record<string, unknown>;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export interface SEMRecordDTO {
  id: string;
  type: string;
  scope: string;
  hive_id: string;
  key: string;
  content: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRunInput {
  tenant_id: string;
  hive_id: string;
  objective: string;
  token_budget: number;
}

export interface CreateFlowInput {
  run_id: string;
  tenant_id: string;
  agent_role: string;
}

export interface CreateStepInput {
  flow_id: string;
  run_id: string;
  tenant_id: string;
  workload_class: string;
  regime: string;
  agent_type: string;
  provider: string;
}

export interface CreateSkillInput {
  name: string;
  version: string;
  description: string;
  prompt_template: string;
  tenant_id?: string;
  tags?: string[];
}

export interface CreateProcessTemplateInput {
  name: string;
  trigger_description: string;
  dag_template: Record<string, unknown>;
  tenant_id?: string;
}

export interface CreateSEMInput {
  type: string;
  scope: string;
  hive_id: string;
  key: string;
  content: string;
  tenant_id?: string;
}
