import type { AgentStatus } from '@/api/agents';
import type { NodeStatus } from '@/types/node';

export type CanonicalAgentStatus = 'running' | 'idle' | 'error' | 'offline';

export type NodeStatusSummary = {
  total: number;
  online: number;
  degraded: number;
  offline: number;
};

export type AgentStatusInput = {
  status?: string | null;
  manualStatus?: string | null;
  presenceStatus?: string | null;
  terminalStatus?: string | null;
  runtimeState?: string | null;
  activeTasks?: number | null;
  runtimeReady?: boolean | null;
};

export type AgentStatusSummary = {
  total: number;
  running: number;
  idle: number;
  error: number;
  offline: number;
};

const lower = (value: unknown) => String(value ?? '').trim().toLowerCase();

export const normalizeNodeStatus = (status: unknown): NodeStatus => {
  const value = lower(status);
  if (value === 'online' || value === 'degraded' || value === 'offline') {
    return value;
  }
  return 'offline';
};

export const summarizeNodes = (nodes: Array<{ status?: unknown }>): NodeStatusSummary => {
  const summary: NodeStatusSummary = { total: nodes.length, online: 0, degraded: 0, offline: 0 };
  for (const node of nodes) {
    summary[normalizeNodeStatus(node.status)] += 1;
  }
  return summary;
};

/**
 * Canonical agent display precedence:
 * 1. Runtime fatal states win (`crashed`, `failed`, `error`).
 * 2. Scheduler work (`activeTasks > 0`) wins over passive terminal/presence.
 * 3. Runtime state is authoritative when present (`running`/`working`/`idle`/`offline`).
 * 4. Terminal state is fallback telemetry.
 * 5. Presence/manual status is the final fallback.
 */
export const resolveAgentStatus = (input: AgentStatusInput): CanonicalAgentStatus => {
  const runtime = lower(input.runtimeState);
  const terminal = lower(input.terminalStatus);
  const presence = lower(input.presenceStatus ?? input.manualStatus ?? input.status);
  const activeTasks = Number(input.activeTasks ?? 0);

  if (['crashed', 'failed', 'error'].includes(runtime) || ['error', 'failed'].includes(terminal)) {
    return 'error';
  }
  if (activeTasks > 0) {
    return 'running';
  }
  if (['running', 'working', 'busy', 'scheduled', 'starting'].includes(runtime)) {
    return 'running';
  }
  if (['idle', 'ready'].includes(runtime)) {
    return 'idle';
  }
  if (['offline', 'stopped', 'terminated'].includes(runtime)) {
    return 'offline';
  }
  if (['running', 'working', 'busy', 'attached'].includes(terminal)) {
    return 'running';
  }
  if (['idle', 'online'].includes(terminal)) {
    return 'idle';
  }
  if (presence === 'offline') {
    return 'offline';
  }
  if (['online', 'idle', 'away'].includes(presence)) {
    return 'idle';
  }
  return input.runtimeReady === false ? 'offline' : 'idle';
};

export const summarizeAgents = (items: AgentStatusInput[]): AgentStatusSummary => {
  const summary: AgentStatusSummary = { total: items.length, running: 0, idle: 0, error: 0, offline: 0 };
  for (const item of items) {
    summary[resolveAgentStatus(item)] += 1;
  }
  return summary;
};

export const agentStatusFromApi = (agent: AgentStatus): AgentStatusInput => ({
  presenceStatus: agent.presenceStatus,
  terminalStatus: agent.terminalStatus,
  runtimeState: agent.runtimeState,
  activeTasks: agent.activeTasks,
  runtimeReady: agent.runtimeReady,
});
