/**
 * Central ledger API — GET & POST /ledger/events (base …/api/v1).
 */

import { getHttpClient } from '@/api/http-binding';
import type { LedgerEventsResponse, LedgerEvent } from '@/types/ledger';

export type LedgerQuery = {
  workspaceId: string;
  teamId?: string;
  memberId?: string;
  nodeId?: string;
  eventType?: string;
  since?: string;
  until?: string;
  limit?: number;
};

type LedgerItemApi = {
  id?: string;
  workspaceId?: string;
  teamId?: string;
  memberId?: string;
  nodeId?: string;
  eventType?: string;
  summary?: string;
  correlationId?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
  timestamp?: string;
};

const mapItem = (raw: LedgerItemApi): LedgerEvent => ({
  id: String(raw.id ?? ''),
  workspaceId: String(raw.workspaceId ?? ''),
  teamId: String(raw.teamId ?? ''),
  memberId: String(raw.memberId ?? ''),
  nodeId: String(raw.nodeId ?? ''),
  eventType: String(raw.eventType ?? ''),
  summary: String(raw.summary ?? ''),
  correlationId: String(raw.correlationId ?? ''),
  sessionId: String(raw.sessionId ?? ''),
  context: raw.context && typeof raw.context === 'object' ? raw.context : {},
  timestamp: String(raw.timestamp ?? '')
});

export async function getLedgerEvents(query: LedgerQuery): Promise<LedgerEventsResponse> {
  const http = getHttpClient();
  const params = new URLSearchParams();
  params.set('workspaceId', query.workspaceId);
  if (query.teamId) {
    params.set('teamId', query.teamId);
  }
  if (query.memberId) {
    params.set('memberId', query.memberId);
  }
  if (query.nodeId) {
    params.set('nodeId', query.nodeId);
  }
  if (query.eventType) {
    params.set('eventType', query.eventType);
  }
  if (query.since) {
    params.set('since', query.since);
  }
  if (query.until) {
    params.set('until', query.until);
  }
  if (query.limit != null) {
    params.set('limit', String(query.limit));
  }
  const path = `/ledger/events?${params.toString()}`;
  const body = await http.get<{ items?: LedgerItemApi[]; total?: number }>(path);
  const items = (body.items ?? []).map(mapItem);
  return { items, total: Number(body.total ?? items.length) };
}

export type CreateLedgerEventInput = {
  workspaceId: string;
  teamId?: string;
  memberId?: string;
  nodeId?: string;
  eventType: string;
  summary: string;
  correlationId?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
};

/** POST /ledger/events — record a new audit event. */
export async function createLedgerEvent(input: CreateLedgerEventInput): Promise<LedgerEvent> {
  const http = getHttpClient();
  const raw = await http.post<LedgerItemApi>('/ledger/events', input);
  return mapItem(raw);
}
