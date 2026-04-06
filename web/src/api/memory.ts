/**
 * API client for distributed Memory Store endpoints.
 * Paths are relative to VITE_API_BASE_URL (default …/api/v1).
 *
 * Scopes: agent (private to actor), team (shared within team), global (workspace-wide).
 */

import { getHttpClient } from '@/api/http-binding';

export type MemoryScope = 'agent' | 'team' | 'global';

export type MemoryEntry = {
  id: string;
  key: string;
  value: string;
  scope: MemoryScope;
  ownerId: string;
  nodeId: string;
  createdAt: string;
  updatedAt: string;
  ttlSeconds: number | null;
};

export type MemoryListResponse = { items: MemoryEntry[] };

export type MemoryPutInput = {
  value: string;
  nodeId?: string;
  ttlSeconds?: number;
};

type MemoryEntryApi = {
  id?: string;
  key?: string;
  value?: string;
  scope?: string;
  ownerId?: string;
  nodeId?: string;
  createdAt?: string;
  updatedAt?: string;
  ttlSeconds?: number | null;
};

function asScope(v: unknown): MemoryScope {
  return v === 'agent' || v === 'team' || v === 'global' ? v : 'global';
}

function mapEntry(raw: MemoryEntryApi): MemoryEntry {
  return {
    id: String(raw.id ?? ''),
    key: String(raw.key ?? ''),
    value: String(raw.value ?? ''),
    scope: asScope(raw.scope),
    ownerId: String(raw.ownerId ?? ''),
    nodeId: String(raw.nodeId ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
    ttlSeconds: raw.ttlSeconds ?? null
  };
}

/** GET /memory/{scope} — list all entries in a scope. */
export const listMemoryEntries = async (scope: MemoryScope, actorId: string): Promise<MemoryListResponse> => {
  const http = getHttpClient();
  const body = await http.get<{ items?: MemoryEntryApi[] }>(
    `/memory/${encodeURIComponent(scope)}`,
    { headers: { 'X-Kraken-Actor-Id': actorId } }
  );
  return { items: (body.items ?? []).map(mapEntry) };
};

/** GET /memory/{scope}/{key} — get a single entry. */
export const getMemoryEntry = async (scope: MemoryScope, key: string, actorId: string): Promise<MemoryEntry> => {
  const http = getHttpClient();
  const raw = await http.get<MemoryEntryApi>(
    `/memory/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`,
    { headers: { 'X-Kraken-Actor-Id': actorId } }
  );
  return mapEntry(raw);
};

/** PUT /memory/{scope}/{key} — create or update an entry. */
export const putMemoryEntry = async (
  scope: MemoryScope,
  key: string,
  input: MemoryPutInput,
  actorId: string
): Promise<MemoryEntry> => {
  const http = getHttpClient();
  const raw = await http.request<MemoryEntryApi>(
    `/memory/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      body: input,
      headers: { 'X-Kraken-Actor-Id': actorId }
    }
  );
  return mapEntry(raw);
};

/** DELETE /memory/{scope}/{key} — remove an entry. */
export const deleteMemoryEntry = async (scope: MemoryScope, key: string, actorId: string): Promise<void> => {
  const http = getHttpClient();
  await http.request<void>(
    `/memory/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      headers: { 'X-Kraken-Actor-Id': actorId }
    }
  );
};
