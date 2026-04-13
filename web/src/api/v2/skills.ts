/**
 * v2 API client — Skill Library endpoints.
 */

import { v2Fetch } from './client';
import type { SkillDefinitionDTO, CreateSkillInput } from './types';

export interface ListSkillsParams {
  tenant_id?: string;
  limit?: number;
}

export const listSkillDefinitions = (params: ListSkillsParams = {}): Promise<SkillDefinitionDTO[]> => {
  const qs = new URLSearchParams();
  if (params.tenant_id) qs.set('tenant_id', params.tenant_id);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<SkillDefinitionDTO[]>(`skills${query ? `?${query}` : ''}`);
};

export const getSkillDefinition = (id: string): Promise<SkillDefinitionDTO> =>
  v2Fetch<SkillDefinitionDTO>(`skills/${encodeURIComponent(id)}`);

export const createSkillDefinition = (input: CreateSkillInput): Promise<SkillDefinitionDTO> =>
  v2Fetch<SkillDefinitionDTO>('skills', { method: 'POST', body: input });
