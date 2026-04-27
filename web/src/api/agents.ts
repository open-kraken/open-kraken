/**
 * API client for unified agent management/status endpoints.
 */

import { getHttpClient } from '@/api/http-binding';

export type AgentPresenceStatus = 'online' | 'idle' | 'away' | 'offline' | 'unknown';

export type AgentStatus = {
  agentId: string;
  nodeId: string;
  nodeHostname: string;
  presenceStatus: AgentPresenceStatus;
  lastHeartbeat: string | null;
  terminalId: string | null;
  terminalStatus: string | null;
  command: string | null;
  activeTasks: number;
  agentInstanceId: string | null;
  runtimeState: string | null;
  agentType: string | null;
  provider: string | null;
  runtimeReady: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
};

export type AgentStatusListResponse = {
  agents: AgentStatus[];
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const asNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asPresenceStatus = (v: unknown): AgentPresenceStatus => {
  if (v === 'online' || v === 'idle' || v === 'away' || v === 'offline') return v;
  return 'unknown';
};

function mapAgentStatus(raw: Record<string, unknown>): AgentStatus {
  const presence = asRecord(raw.presence);
  const terminal = asRecord(raw.terminal);
  const tokens = asRecord(raw.tokens);

  return {
    agentId: String(raw.agentId ?? ''),
    nodeId: String(raw.nodeId ?? ''),
    nodeHostname: String(raw.nodeHostname ?? ''),
    presenceStatus: asPresenceStatus(presence.status),
    lastHeartbeat: presence.lastHeartbeat ? String(presence.lastHeartbeat) : null,
    terminalId: terminal.terminalId ? String(terminal.terminalId) : null,
    terminalStatus: terminal.status ? String(terminal.status) : null,
    command: terminal.command ? String(terminal.command) : null,
    activeTasks: asNumber(raw.activeTasks),
    agentInstanceId: raw.agentInstanceId ? String(raw.agentInstanceId) : null,
    runtimeState: raw.runtimeState ? String(raw.runtimeState) : null,
    agentType: raw.agentType ? String(raw.agentType) : null,
    provider: raw.provider ? String(raw.provider) : null,
    runtimeReady: raw.runtimeReady === true,
    totalInputTokens: asNumber(tokens.totalInput),
    totalOutputTokens: asNumber(tokens.totalOutput),
    totalCost: asNumber(tokens.totalCost),
  };
}

/** GET /agents/status */
export const getAgentStatuses = async (workspaceId?: string): Promise<AgentStatusListResponse> => {
  const http = getHttpClient();
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const body = await http.get<{ agents?: Record<string, unknown>[] }>(`/agents/status${query}`);
  return { agents: (body.agents ?? []).map(mapAgentStatus).filter((a) => a.agentId) };
};
