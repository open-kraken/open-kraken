/**
 * Nodes store — shared state for the node management feature (T08).
 * Exposes a hook that encapsulates the load / mutate lifecycle for nodes.
 * State is kept local to each NodesPage mount; lift to a context provider
 * when cross-page sharing is required.
 */

import { useState, useCallback } from 'react';
import type { Node } from '@/types/node';
import { getNodes, assignAgentToNode, unassignAgentFromNode, registerNode, deregisterNode, type RegisterNodeInput } from '@/api/nodes';
import { useAsyncStore, type AsyncLoadState } from './useAsyncStore';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type NodesLoadState = AsyncLoadState;

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
  const loadFn = useCallback(async () => {
    const response = await getNodes();
    return response.nodes;
  }, []);

  const store = useAsyncStore<Node[]>([], loadFn);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  /** Assign an agent (member) to a node and update store in place. */
  const assignAgent = useCallback(async (nodeId: string, memberId: string) => {
    await assignAgentToNode(nodeId, { memberId });
    await store.load();
  }, [store.load]);

  /** Remove an agent assignment from a node and update store in place. */
  const unassignAgent = useCallback(async (nodeId: string, memberId: string) => {
    await unassignAgentFromNode(nodeId, memberId);
    await store.load();
  }, [store.load]);

  const createNode = useCallback(async (input: RegisterNodeInput) => {
    await registerNode(input);
    await store.load();
  }, [store.load]);

  const removeNode = useCallback(async (nodeId: string) => {
    await deregisterNode(nodeId);
    setSelectedNodeId((current) => (current === nodeId ? null : current));
    await store.load();
  }, [store.load]);

  return {
    nodes: store.data,
    loadState: store.loadState,
    errorMessage: store.errorMessage,
    selectedNodeId,
    loadNodes: store.load,
    selectNode,
    assignAgent,
    unassignAgent,
    createNode,
    removeNode
  };
};
