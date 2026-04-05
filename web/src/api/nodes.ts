/**
 * API client for Node management endpoints (T08).
 * Matches the contract: GET /api/nodes, GET /api/nodes/{id},
 * POST /api/nodes/{id}/agents (assign), DELETE /api/nodes/{id}/agents/{memberId} (unassign).
 *
 * Backend is not yet complete — all functions fall back to mock data.
 * Remove mock branches once real endpoints are live.
 */

import type { Node } from '@/types/node';

// ---------------------------------------------------------------------------
// Mock data (remove when backend is ready)
// ---------------------------------------------------------------------------

const MOCK_NODES: Node[] = [
  {
    id: 'node-001',
    hostname: 'k8s-pod-alpha-1',
    nodeType: 'k8s_pod',
    status: 'online',
    labels: { zone: 'us-east-1a', tier: 'standard' },
    registeredAt: '2026-04-01T08:00:00Z',
    lastHeartbeatAt: '2026-04-05T12:00:00Z',
    assignedAgents: ['agent-frontend-1', 'agent-backend-1']
  },
  {
    id: 'node-002',
    hostname: 'bare-metal-worker-2',
    nodeType: 'bare_metal',
    status: 'degraded',
    labels: { zone: 'us-east-1b', tier: 'high-memory' },
    registeredAt: '2026-03-15T10:00:00Z',
    lastHeartbeatAt: '2026-04-05T11:50:00Z',
    assignedAgents: ['agent-qa-1']
  },
  {
    id: 'node-003',
    hostname: 'k8s-pod-gamma-3',
    nodeType: 'k8s_pod',
    status: 'offline',
    labels: { zone: 'us-west-2a', tier: 'standard' },
    registeredAt: '2026-03-20T09:00:00Z',
    lastHeartbeatAt: '2026-04-04T18:30:00Z',
    assignedAgents: []
  }
];

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type NodesListResponse = { nodes: Node[] };
export type NodeResponse = { node: Node };
export type AssignAgentInput = { memberId: string };

// ---------------------------------------------------------------------------
// Client functions
// ---------------------------------------------------------------------------

/** GET /api/nodes — list all registered nodes. */
export const getNodes = async (): Promise<NodesListResponse> => {
  // TODO: replace with real HTTP call once backend is ready
  // return httpClient.get<NodesListResponse>('/api/nodes');
  return Promise.resolve({ nodes: MOCK_NODES });
};

/** GET /api/nodes/{id} — fetch a single node by ID. */
export const getNode = async (nodeId: string): Promise<NodeResponse> => {
  // TODO: return httpClient.get<NodeResponse>(`/api/nodes/${nodeId}`);
  const node = MOCK_NODES.find((n) => n.id === nodeId);
  if (!node) {
    return Promise.reject(new Error(`node_not_found:${nodeId}`));
  }
  return Promise.resolve({ node });
};

/** POST /api/nodes/{id}/agents — assign an agent (member) to a node. */
export const assignAgentToNode = async (nodeId: string, input: AssignAgentInput): Promise<NodeResponse> => {
  // TODO: return httpClient.post<NodeResponse>(`/api/nodes/${nodeId}/agents`, input);
  const idx = MOCK_NODES.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return Promise.reject(new Error(`node_not_found:${nodeId}`));
  }
  const node = { ...MOCK_NODES[idx] };
  if (!node.assignedAgents.includes(input.memberId)) {
    node.assignedAgents = [...node.assignedAgents, input.memberId];
    MOCK_NODES[idx] = node;
  }
  return Promise.resolve({ node });
};

/** DELETE /api/nodes/{id}/agents/{memberId} — unassign an agent from a node. */
export const unassignAgentFromNode = async (nodeId: string, memberId: string): Promise<NodeResponse> => {
  // TODO: return httpClient.request<NodeResponse>(`/api/nodes/${nodeId}/agents/${memberId}`, { method: 'DELETE' });
  const idx = MOCK_NODES.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return Promise.reject(new Error(`node_not_found:${nodeId}`));
  }
  const node = { ...MOCK_NODES[idx], assignedAgents: MOCK_NODES[idx].assignedAgents.filter((id) => id !== memberId) };
  MOCK_NODES[idx] = node;
  return Promise.resolve({ node });
};
