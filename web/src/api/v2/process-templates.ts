/**
 * v2 API client — Process Template endpoints.
 */

import { v2Fetch } from './client';
import type { ProcessTemplateDTO, CreateProcessTemplateInput } from './types';

export interface ListProcessTemplatesParams {
  limit?: number;
}

export const listProcessTemplates = (params: ListProcessTemplatesParams = {}): Promise<ProcessTemplateDTO[]> => {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<ProcessTemplateDTO[]>(`process-templates${query ? `?${query}` : ''}`);
};

export const createProcessTemplate = (input: CreateProcessTemplateInput): Promise<ProcessTemplateDTO> =>
  v2Fetch<ProcessTemplateDTO>('process-templates', { method: 'POST', body: input });
