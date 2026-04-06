/**
 * NodesPage — main page for the Node Management feature (T08).
 * Provides a list view and card/topology view toggle for registered nodes.
 * Handles WebSocket events: node.snapshot, node.updated, node.offline.
 * Agent assignment uses real workspace members fetched from the API.
 */

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { useNodesStore } from '@/state/nodesStore';
import { NodeList } from '@/features/nodes/NodeList';
import { NodeCard } from '@/features/nodes/NodeCard';
import { NodeAgentAssign } from '@/features/nodes/NodeAgentAssign';
import type { Node } from '@/types/node';
import styles from '@/features/nodes/nodes-feature.module.css';
import type { AgentOption } from '@/features/nodes/NodeAgentAssign';

/** View mode: 'list' shows a table, 'topology' shows node cards in a grid. */
type ViewMode = 'list' | 'topology';

export const NodesPage = () => {
  const { t } = useI18n();
  const { realtimeClient, apiClient } = useAppShell();
  const store = useNodesStore();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [assignTargetNodeId, setAssignTargetNodeId] = useState<string | null>(null);
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  // Load nodes on mount
  useEffect(() => {
    void store.loadNodes();
  }, [store.loadNodes]);

  // Load real workspace members for agent assignment
  useEffect(() => {
    let cancelled = false;
    setAgentsLoading(true);
    void apiClient
      .getMembers()
      .then((response) => {
        if (cancelled) return;
        const members = response.members ?? [];
        setAgentOptions(
          members.map((m) => ({
            memberId: m.memberId,
            displayName: m.displayName ?? m.memberId
          }))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAgentOptions([]);
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiClient]);

  // Subscribe to realtime node events
  useEffect(() => {
    const snapshotSub = realtimeClient.subscribe<{ nodes: Node[] }>('node.snapshot', (event) => {
      void store.loadNodes();
      void event;
    });

    const updatedSub = realtimeClient.subscribe<Node>('node.updated', (_event) => {
      void store.loadNodes();
    });

    const offlineSub = realtimeClient.subscribe<{ nodeId: string }>('node.offline', (_event) => {
      void store.loadNodes();
    });

    return () => {
      snapshotSub.unsubscribe();
      updatedSub.unsubscribe();
      offlineSub.unsubscribe();
    };
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
          <p className="page-eyebrow">{t('nodes.eyebrow')}</p>
          <h1>{t('nodes.title')}</h1>
          <p className="route-page__intro">{t('nodes.intro')}</p>
        </div>

        <div className="route-page__metric-strip" aria-label={t('nodes.metricsAria')}>
          <div className="route-page__metric">
            <span className="route-page__metric-label">{t('nodes.total')}</span>
            <strong>{store.nodes.length}</strong>
            <small>{t('nodes.registeredNodes')}</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">{t('nodes.online')}</span>
            <strong>{onlineCount}</strong>
            <small>{t('nodes.healthyNodes')}</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">{t('nodes.degraded')}</span>
            <strong>{degradedCount}</strong>
            <small>{t('nodes.partialFailures')}</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">{t('nodes.offline')}</span>
            <strong>{offlineCount}</strong>
            <small>{t('nodes.unreachable')}</small>
          </div>
        </div>
      </div>

      {/* View mode toggle */}
      <div className={styles['nodes-toolbar']}>
        <button
          type="button"
          className={`${styles['nodes-toolbar__btn']}${viewMode === 'list' ? ` ${styles['nodes-toolbar__btn--active']}` : ''}`}
          onClick={() => setViewMode('list')}
          aria-pressed={viewMode === 'list'}
        >
          {t('nodes.viewList')}
        </button>
        <button
          type="button"
          className={`${styles['nodes-toolbar__btn']}${viewMode === 'topology' ? ` ${styles['nodes-toolbar__btn--active']}` : ''}`}
          onClick={() => setViewMode('topology')}
          aria-pressed={viewMode === 'topology'}
        >
          {t('nodes.viewTopology')}
        </button>

        <button
          type="button"
          className={`${styles['nodes-toolbar__btn']} ${styles['nodes-toolbar__btn--refresh']}`}
          onClick={() => void store.loadNodes()}
          disabled={store.loadState === 'loading'}
        >
          {store.loadState === 'loading' ? t('nodes.loading') : t('nodes.refresh')}
        </button>
      </div>

      {/* Error state */}
      {store.loadState === 'error' && (
        <div role="alert" className="nodes-page__alert">
          {t('nodes.loadError', { message: store.errorMessage ?? '' })}
        </div>
      )}

      {/* Loading skeleton */}
      {store.loadState === 'loading' && store.nodes.length === 0 && (
        <div role="status" className="nodes-page__loading">
          {t('nodes.loadingNodes')}
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
        <div className="nodes-topology-grid">
          {store.nodes.length === 0 ? (
            <p className="nodes-page__empty-hint">{t('nodes.empty')}</p>
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
          allAgents={agentOptions}
          onAssign={async (nodeId, memberId) => { await store.assignAgent(nodeId, memberId); }}
          onUnassign={async (nodeId, memberId) => { await store.unassignAgent(nodeId, memberId); }}
          onClose={() => setAssignTargetNodeId(null)}
        />
      )}
    </section>
  );
};
