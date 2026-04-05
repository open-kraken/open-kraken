/**
 * API client for Node management endpoints (T08).
 * Paths are relative to VITE_API_BASE_URL (default …/api/v1).
 */

import { getHttpClient } from '@/api/http-binding';
import type { Node, NodeStatus, NodeType } from '@/types/node';

export type NodesListResponse = { nodes: Node[] };
export type NodeResponse = { node: Node };
export type AssignAgentInput = { memberId: string };

function asNodeType(v: unknown): NodeType {
  return v === 'k8s_pod' || v === 'bare_metal' ? v : 'k8s_pod';
}

function asNodeStatus(v: unknown): NodeStatus {
  return v === 'online' || v === 'offline' || v === 'degraded' ? v : 'offline';
}

function mapNode(raw: Record<string, unknown>): Node {
  const labels = (raw.labels as Record<string, string>) ?? {};
  const agentId = labels.agent_id;
  const assignedAgents = agentId ? [agentId] : [];
  return {
    id: String(raw.id ?? ''),
    hostname: String(raw.hostname ?? ''),
    nodeType: asNodeType(raw.nodeType),
    status: asNodeStatus(raw.status),
    labels,
    registeredAt: String(raw.registeredAt ?? ''),
    lastHeartbeatAt: String(raw.lastHeartbeatAt ?? ''),
    assignedAgents
  };
}

/** GET /nodes — list all registered nodes. */
export const getNodes = async (): Promise<NodesListResponse> => {
  const http = getHttpClient();
  const body = await http.get<{ items?: Record<string, unknown>[] }>('/nodes');
  const items = body.items ?? [];
  return { nodes: items.map((row) => mapNode(row)) };
};

/** GET /nodes/{id} */
export const getNode = async (nodeId: string): Promise<NodeResponse> => {
  const http = getHttpClient();
  const raw = await http.get<Record<string, unknown>>(`/nodes/${encodeURIComponent(nodeId)}`);
  return { node: mapNode(raw) };
};

/** POST /nodes/{id}/agents */
export const assignAgentToNode = async (nodeId: string, input: AssignAgentInput): Promise<NodeResponse> => {
  const http = getHttpClient();
  const raw = await http.post<Record<string, unknown>>(`/nodes/${encodeURIComponent(nodeId)}/agents`, {
    agentId: input.memberId
  });
  return { node: mapNode(raw) };
};

/** DELETE /nodes/{id}/agents/{memberId} */
export const unassignAgentFromNode = async (nodeId: string, memberId: string): Promise<NodeResponse> => {
  const http = getHttpClient();
  const raw = await http.request<Record<string, unknown>>(
    `/nodes/${encodeURIComponent(nodeId)}/agents/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' }
  );
  return { node: mapNode(raw) };
};
