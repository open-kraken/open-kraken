/**
 * Nodes store — shared state for the node management feature (T08).
 * Exposes a hook that encapsulates the load / mutate lifecycle for nodes.
 * State is kept local to each NodesPage mount; lift to a context provider
 * when cross-page sharing is required.
 */

import { useState, useCallback } from 'react';
import type { Node } from '@/types/node';
import { getNodes, assignAgentToNode, unassignAgentFromNode } from '@/api/nodes';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type NodesLoadState = 'idle' | 'loading' | 'success' | 'error';

export type NodesStoreState = {
  nodes: Node[];
  loadState: NodesLoadState;
  errorMessage: string | null;
  selectedNodeId: string | null;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useNodesStore
 * Encapsulates node list loading, node selection, and agent assignment mutations.
 * Intended to be used at the NodesPage level and passed down as props where needed.
 */
export const useNodesStore = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loadState, setLoadState] = useState<NodesLoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  /** Reload the full node list from the API / mock. */
  const loadNodes = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const response = await getNodes();
      setNodes(response.nodes);
      setLoadState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load nodes');
      setLoadState('error');
    }
  }, []);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  /** Assign an agent (member) to a node and update store in place. */
  const assignAgent = useCallback(async (nodeId: string, memberId: string) => {
    const response = await assignAgentToNode(nodeId, { memberId });
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? response.node : n)));
  }, []);

  /** Remove an agent assignment from a node and update store in place. */
  const unassignAgent = useCallback(async (nodeId: string, memberId: string) => {
    const response = await unassignAgentFromNode(nodeId, memberId);
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? response.node : n)));
  }, []);

  return {
    nodes,
    loadState,
    errorMessage,
    selectedNodeId,
    loadNodes,
    selectNode,
    assignAgent,
    unassignAgent
  };
};
