/**
 * Domain types for Node management (T08).
 * Nodes represent execution environments (Kubernetes pods or bare-metal hosts)
 * to which workspace agents can be assigned.
 */

/** The execution environment type for a node. */
export type NodeType = 'k8s_pod' | 'bare_metal';

/** The health / availability state of a node. */
export type NodeStatus = 'online' | 'offline' | 'degraded';

/**
 * A registered execution node in the workspace.
 * Nodes surface runtime topology and determine where agents are scheduled.
 */
export interface Node {
  id: string;
  hostname: string;
  nodeType: NodeType;
  status: NodeStatus;
  /** Arbitrary key-value labels attached to the node (e.g. zone, tier). */
  labels: Record<string, string>;
  registeredAt: string;
  lastHeartbeatAt: string;
  /** 0 means unlimited on the backend; the UI may still use a visual fallback. */
  maxAgents: number;
  agentCount: number;
  /** List of memberId values assigned to this node. */
  assignedAgents: string[];
}
