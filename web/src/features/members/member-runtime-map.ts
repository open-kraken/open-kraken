import type { Node, NodeStatus } from '@/types/node';

export type MemberNodeBinding = {
  nodeId: string;
  hostname: string;
  status: NodeStatus;
};

/** Maps each assigned agent id (memberId) to the node that runs it (from GET /nodes). */
export const buildNodeBindingByMemberId = (nodes: Node[]): Record<string, MemberNodeBinding> => {
  const out: Record<string, MemberNodeBinding> = {};
  for (const n of nodes) {
    for (const agentId of n.assignedAgents) {
      out[agentId] = {
        nodeId: n.id,
        hostname: n.hostname,
        status: n.status
      };
    }
  }
  return out;
};
