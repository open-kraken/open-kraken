/**
 * v2 API client — Skill Library endpoints.
 */

import { v2Fetch } from './client';
import type { SkillDefinitionDTO, CreateSkillInput } from './types';

export interface ListSkillsParams {
  tenant_id?: string;
  limit?: number;
}

type SkillDefinitionsListResponse = {
  items?: Record<string, unknown>[];
  total?: number;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const mapSkillDefinition = (raw: Record<string, unknown>): SkillDefinitionDTO => ({
  id: String(raw.id ?? ''),
  name: String(raw.name ?? ''),
  version: Number(raw.version ?? 1),
  description: String(raw.description ?? ''),
  prompt_template: String(raw.promptTemplate ?? raw.prompt_template ?? ''),
  tenant_id: String(raw.tenantId ?? raw.tenant_id ?? ''),
  tags: asStringArray(raw.workloadClassTags ?? raw.workload_class_tags ?? raw.tags),
  created_at: String(raw.publishedAt ?? raw.created_at ?? ''),
  updated_at: String(raw.updatedAt ?? raw.updated_at ?? raw.publishedAt ?? ''),
});

const toCreateSkillBody = (input: CreateSkillInput) => ({
  name: input.name,
  version: input.version,
  description: input.description,
  prompt_template: input.prompt_template,
  tool_requirements: input.tool_requirements ?? [],
  agent_type_affinity: input.agent_type_affinity ?? [],
  workload_class_tags: input.workload_class_tags ?? input.tags ?? [],
  tenant_id: input.tenant_id ?? '',
});

export const listSkillDefinitions = (params: ListSkillsParams = {}): Promise<SkillDefinitionDTO[]> => {
  const qs = new URLSearchParams();
  if (params.tenant_id) qs.set('tenant_id', params.tenant_id);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<SkillDefinitionsListResponse>(`skills${query ? `?${query}` : ''}`).then((response) =>
    Array.isArray(response.items) ? response.items.map(mapSkillDefinition) : [],
  );
};

export const getSkillDefinition = (id: string): Promise<SkillDefinitionDTO> =>
  v2Fetch<Record<string, unknown>>(`skills/${encodeURIComponent(id)}`).then(mapSkillDefinition);

export const createSkillDefinition = (input: CreateSkillInput): Promise<SkillDefinitionDTO> =>
  v2Fetch<Record<string, unknown>>('skills', { method: 'POST', body: toCreateSkillBody(input) }).then(mapSkillDefinition);
