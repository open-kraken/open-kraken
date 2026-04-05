/**
 * API client for Token consumption endpoints (T09).
 * Matches: GET /api/tokens/stats, POST /api/tokens/events.
 *
 * Backend is not yet complete — all functions fall back to mock data.
 * Remove mock branches once real endpoints are live.
 */

import type { TokenStats, AgentActivity } from '@/types/token';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TOKEN_STATS: TokenStats[] = [
  {
    memberId: 'agent-frontend-1',
    memberName: 'Frontend Engineer',
    nodeId: 'node-001',
    inputTokens: 42000,
    outputTokens: 18000,
    totalTokens: 60000,
    cost: 0.72,
    period: '2026-04-05'
  },
  {
    memberId: 'agent-backend-1',
    memberName: 'Backend Engineer',
    nodeId: 'node-001',
    inputTokens: 75000,
    outputTokens: 30000,
    totalTokens: 105000,
    cost: 1.26,
    period: '2026-04-05'
  },
  {
    memberId: 'agent-qa-1',
    memberName: 'QA Engineer',
    nodeId: 'node-002',
    inputTokens: 20000,
    outputTokens: 8000,
    totalTokens: 28000,
    cost: 0.34,
    period: '2026-04-05'
  },
  {
    memberId: 'agent-lead-1',
    memberName: 'Tech Lead',
    inputTokens: 55000,
    outputTokens: 22000,
    totalTokens: 77000,
    cost: 0.92,
    period: '2026-04-05'
  }
];

const MOCK_ACTIVITY: AgentActivity[] = [
  {
    memberId: 'agent-frontend-1',
    memberName: 'Frontend Engineer',
    status: 'running',
    currentTask: 'T08 — Node management panel',
    tokenStats: MOCK_TOKEN_STATS[0]
  },
  {
    memberId: 'agent-backend-1',
    memberName: 'Backend Engineer',
    status: 'running',
    currentTask: 'Backend API implementation',
    tokenStats: MOCK_TOKEN_STATS[1]
  },
  {
    memberId: 'agent-qa-1',
    memberName: 'QA Engineer',
    status: 'idle',
    tokenStats: MOCK_TOKEN_STATS[2]
  },
  {
    memberId: 'agent-lead-1',
    memberName: 'Tech Lead',
    status: 'idle',
    tokenStats: MOCK_TOKEN_STATS[3]
  }
];

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type TokenStatsResponse = {
  stats: TokenStats[];
  period: string;
};

export type AgentActivityResponse = {
  activities: AgentActivity[];
};

export type TokenEventInput = {
  memberId: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Client functions
// ---------------------------------------------------------------------------

/** GET /api/tokens/stats — aggregated token usage for all members. */
export const getTokenStats = async (): Promise<TokenStatsResponse> => {
  // TODO: return httpClient.get<TokenStatsResponse>('/api/tokens/stats');
  return Promise.resolve({ stats: MOCK_TOKEN_STATS, period: '2026-04-05' });
};

/** GET /api/tokens/activity — agent activity with inline token stats. */
export const getAgentActivity = async (): Promise<AgentActivityResponse> => {
  // TODO: return httpClient.get<AgentActivityResponse>('/api/tokens/activity');
  return Promise.resolve({ activities: MOCK_ACTIVITY });
};

/** POST /api/tokens/events — ingest a raw token consumption event. */
export const postTokenEvent = async (input: TokenEventInput): Promise<void> => {
  // TODO: return httpClient.post('/api/tokens/events', input);
  console.debug('[tokens] mock event ingested', input);
  return Promise.resolve();
};
