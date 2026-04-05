/**
 * NodesPage — main page for the Node Management feature (T08).
 * Provides a list view and card/topology view toggle for registered nodes.
 * Handles WebSocket events: node.snapshot, node.updated, node.offline.
 */

import { useEffect, useState } from 'react';
import { useAppShell } from '@/state/app-shell-store';
import { useNodesStore } from '@/state/nodesStore';
import { NodeList } from '@/features/nodes/NodeList';
import { NodeCard } from '@/features/nodes/NodeCard';
import { NodeAgentAssign } from '@/features/nodes/NodeAgentAssign';
import type { Node } from '@/types/node';
import type { AgentOption } from '@/features/nodes/NodeAgentAssign';
import type { RealtimeEnvelope } from '@/realtime/realtime-client';

/** View mode: 'list' shows a table, 'topology' shows node cards in a grid. */
type ViewMode = 'list' | 'topology';

// Mock agent options derived from the workspace — replace with real member list from apiClient
const MOCK_AGENTS: AgentOption[] = [
  { memberId: 'agent-frontend-1', displayName: 'Frontend Engineer' },
  { memberId: 'agent-backend-1', displayName: 'Backend Engineer' },
  { memberId: 'agent-qa-1', displayName: 'QA Engineer' },
  { memberId: 'agent-lead-1', displayName: 'Tech Lead' }
];

export const NodesPage = () => {
  const { realtimeClient } = useAppShell();
  const store = useNodesStore();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [assignTargetNodeId, setAssignTargetNodeId] = useState<string | null>(null);

  // Load nodes on mount
  useEffect(() => {
    void store.loadNodes();
  }, [store.loadNodes]);

  // Subscribe to realtime node events
  useEffect(() => {
    // node.snapshot: full node list pushed by server on connect
    const snapshotSub = realtimeClient.subscribe<{ nodes: Node[] }>('node.snapshot', (event) => {
      // Replace the full list via a reload so we stay consistent with API shape
      void store.loadNodes();
      void event; // acknowledged
    });

    // node.updated: single node was updated
    const updatedSub = realtimeClient.subscribe<Node>('node.updated', (_event) => {
      void store.loadNodes();
    });

    // node.offline: a node went offline
    const offlineSub = realtimeClient.subscribe<{ nodeId: string }>('node.offline', (_event) => {
      void store.loadNodes();
    });

    return () => {
      snapshotSub.unsubscribe();
      updatedSub.unsubscribe();
      offlineSub.unsubscribe();
    };
    // store.loadNodes is stable (useCallback with no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeClient]);

  const assignTarget = assignTargetNodeId
    ? store.nodes.find((n) => n.id === assignTargetNodeId) ?? null
    : null;

  const onlineCount = store.nodes.filter((n) => n.status === 'online').length;
  const degradedCount = store.nodes.filter((n) => n.status === 'degraded').length;
  const offlineCount = store.nodes.filter((n) => n.status === 'offline').length;

  return (
    <section className="page-card page-card--nodes" data-page-entry="nodes">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">Infrastructure</p>
          <h1>Node management</h1>
          <p className="route-page__intro">
            Registered execution environments. Assign agents to nodes to control where workloads run.
          </p>
        </div>

        <div className="route-page__metric-strip" aria-label="Node metrics">
          <div className="route-page__metric">
            <span className="route-page__metric-label">Total</span>
            <strong>{store.nodes.length}</strong>
            <small>Registered nodes</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">Online</span>
            <strong>{onlineCount}</strong>
            <small>Healthy nodes</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">Degraded</span>
            <strong>{degradedCount}</strong>
            <small>Partial failures</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">Offline</span>
            <strong>{offlineCount}</strong>
            <small>Unreachable</small>
          </div>
        </div>
      </div>

      {/* View mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setViewMode('list')}
          aria-pressed={viewMode === 'list'}
          style={{
            padding: '5px 14px',
            borderRadius: '4px',
            border: `1px solid ${viewMode === 'list' ? '#6366f1' : '#374151'}`,
            color: viewMode === 'list' ? '#6366f1' : '#9ca3af',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => setViewMode('topology')}
          aria-pressed={viewMode === 'topology'}
          style={{
            padding: '5px 14px',
            borderRadius: '4px',
            border: `1px solid ${viewMode === 'topology' ? '#6366f1' : '#374151'}`,
            color: viewMode === 'topology' ? '#6366f1' : '#9ca3af',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          Topology
        </button>

        <button
          type="button"
          onClick={() => void store.loadNodes()}
          disabled={store.loadState === 'loading'}
          style={{
            marginLeft: 'auto',
            padding: '5px 14px',
            borderRadius: '4px',
            border: '1px solid #374151',
            color: '#9ca3af',
            background: 'transparent',
            cursor: store.loadState === 'loading' ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem'
          }}
        >
          {store.loadState === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Error state */}
      {store.loadState === 'error' && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: 'rgba(220,38,38,0.1)',
            border: '1px solid #dc2626',
            color: '#fca5a5',
            marginBottom: '16px'
          }}
        >
          Failed to load nodes: {store.errorMessage}
        </div>
      )}

      {/* Loading skeleton */}
      {store.loadState === 'loading' && store.nodes.length === 0 && (
        <div role="status" style={{ color: '#6b7280', padding: '32px', textAlign: 'center' }}>
          Loading nodes…
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && store.loadState !== 'loading' && (
        <NodeList
          nodes={store.nodes}
          selectedNodeId={store.selectedNodeId}
          onSelect={store.selectNode}
          onAssignClick={(nodeId) => setAssignTargetNodeId(nodeId)}
        />
      )}

      {/* Topology / card grid view */}
      {viewMode === 'topology' && store.loadState !== 'loading' && (
        <div
          className="nodes-topology-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
        >
          {store.nodes.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No nodes registered.</p>
          ) : (
            store.nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={node.id === store.selectedNodeId}
                onSelect={store.selectNode}
                onAssignClick={(nodeId) => setAssignTargetNodeId(nodeId)}
              />
            ))
          )}
        </div>
      )}

      {/* Agent assignment dialog */}
      {assignTarget && (
        <NodeAgentAssign
          node={assignTarget}
          allAgents={MOCK_AGENTS}
          onAssign={store.assignAgent}
          onUnassign={store.unassignAgent}
          onClose={() => setAssignTargetNodeId(null)}
        />
      )}
    </section>
  );
};
