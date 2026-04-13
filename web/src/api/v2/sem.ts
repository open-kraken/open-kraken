/**
 * v2 API client — SEM (Structured Episodic Memory) endpoints.
 */

import { v2Fetch } from './client';
import type { SEMRecordDTO, CreateSEMInput } from './types';

export interface ListSEMParams {
  hive_id?: string;
  type?: string;
  scope?: string;
  limit?: number;
}

export const listSEMRecords = (params: ListSEMParams = {}): Promise<SEMRecordDTO[]> => {
  const qs = new URLSearchParams();
  if (params.hive_id) qs.set('hive_id', params.hive_id);
  if (params.type) qs.set('type', params.type);
  if (params.scope) qs.set('scope', params.scope);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return v2Fetch<SEMRecordDTO[]>(`sem${query ? `?${query}` : ''}`);
};

export const getSEMRecord = (id: string): Promise<SEMRecordDTO> =>
  v2Fetch<SEMRecordDTO>(`sem/${encodeURIComponent(id)}`);

export const createSEMRecord = (input: CreateSEMInput): Promise<SEMRecordDTO> =>
  v2Fetch<SEMRecordDTO>('sem', { method: 'POST', body: input });
