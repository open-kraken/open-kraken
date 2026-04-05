/**
 * API client for Token consumption endpoints (T09).
 * Paths are relative to VITE_API_BASE_URL (default …/api/v1).
 */

import { getHttpClient } from '@/api/http-binding';
import type { TokenStats, AgentActivity } from '@/types/token';

export type TokenStatsResponse = {
  stats: TokenStats[];
  period: string;
};

export type AgentActivityResponse = {
  activities: AgentActivity[];
};

export type TokenEventInput = {
  memberId: string;
  nodeId?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cost?: number;
};

type StatsApi = {
  scope?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCost?: number;
  eventCount?: number;
};

type ActivityEventApi = {
  memberId?: string;
  nodeId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  timestamp?: string;
};

/** GET /tokens/stats — maps aggregate API response to dashboard rows. */
export const getTokenStats = async (): Promise<TokenStatsResponse> => {
  const http = getHttpClient();
  const raw = await http.get<StatsApi>('/tokens/stats');
  const period = new Date().toISOString().slice(0, 10);
  const stat: TokenStats = {
    memberId: 'aggregate',
    memberName: raw.scope === 'all' ? 'All members' : String(raw.scope ?? 'Workspace'),
    inputTokens: Number(raw.inputTokens ?? 0),
    outputTokens: Number(raw.outputTokens ?? 0),
    totalTokens: Number(raw.totalTokens ?? 0),
    cost: Number(raw.totalCost ?? 0),
    period
  };
  return { stats: [stat], period };
};

/** GET /tokens/activity */
export const getAgentActivity = async (): Promise<AgentActivityResponse> => {
  const http = getHttpClient();
  const body = await http.get<{ items?: ActivityEventApi[] }>('/tokens/activity');
  const items = body.items ?? [];
  const activities: AgentActivity[] = items.map((e) => {
    const memberId = String(e.memberId ?? '');
    const inT = Number(e.inputTokens ?? 0);
    const outT = Number(e.outputTokens ?? 0);
    const ts: TokenStats = {
      memberId,
      memberName: memberId,
      nodeId: e.nodeId ? String(e.nodeId) : undefined,
      inputTokens: inT,
      outputTokens: outT,
      totalTokens: inT + outT,
      cost: Number(e.cost ?? 0),
      period: (e.timestamp ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)
    };
    return {
      memberId,
      memberName: memberId,
      status: 'active',
      currentTask: e.model ? String(e.model) : undefined,
      tokenStats: ts
    };
  });
  return { activities };
};

/** POST /tokens/events */
export const postTokenEvent = async (input: TokenEventInput): Promise<void> => {
  const http = getHttpClient();
  await http.post('/tokens/events', {
    memberId: input.memberId,
    nodeId: input.nodeId ?? '',
    model: input.model ?? '',
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cost: input.cost ?? 0
  });
};
