/**
 * NodeList renders a tabular view of all registered nodes (T08).
 * Columns: hostname / type / status / assigned agents count / last heartbeat.
 * Clicking a row selects it; the Assign action opens the assignment dialog.
 */

import { useI18n } from '@/i18n/I18nProvider';
import type { Node } from '@/types/node';
import { NodeStatusBadge } from './NodeStatusBadge';

export type NodeListProps = {
  nodes: Node[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onAssignClick: (nodeId: string) => void;
};

/**
 * NodeList
 * Table view showing all nodes with key metadata and quick actions.
 *
 * @param nodes - Array of nodes to display.
 * @param selectedNodeId - The currently selected node's ID (highlights the row).
 * @param onSelect - Called when a row is clicked.
 * @param onAssignClick - Called when the Assign action is triggered for a node.
 */
export const NodeList = ({ nodes, selectedNodeId, onSelect, onAssignClick }: NodeListProps) => {
  const { t } = useI18n();

  if (nodes.length === 0) {
    return (
      <div className="node-list--empty" role="status">
        {t('nodeList.empty')}
      </div>
    );
  }

  return (
    <div className="node-list">
      <table aria-label={t('nodeList.tableAria')}>
        <thead>
          <tr>
            <th>{t('nodeList.hostname')}</th>
            <th>{t('nodeList.type')}</th>
            <th>{t('nodeList.status')}</th>
            <th>{t('nodeList.assigned')}</th>
            <th>{t('nodeList.heartbeat')}</th>
            <th>{t('nodeList.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            return (
              <tr
                key={node.id}
                data-node-id={node.id}
                onClick={() => onSelect(node.id)}
                aria-selected={isSelected}
              >
                <td>{node.hostname}</td>
                <td className="node-list__cell--muted">
                  {node.nodeType === 'k8s_pod' ? t('nodeList.k8sPod') : t('nodeList.bareMetal')}
                </td>
                <td>
                  <NodeStatusBadge status={node.status} />
                </td>
                <td
                  className={
                    node.assignedAgents.length === 0 ? 'node-list__cell--muted' : undefined
                  }
                >
                  {node.assignedAgents.length === 0
                    ? t('nodeList.none')
                    : node.assignedAgents.length === 1
                      ? t('nodeList.agentCount', { count: node.assignedAgents.length })
                      : t('nodeList.agentCountPlural', { count: node.assignedAgents.length })}
                </td>
                <td className="node-list__cell--meta">
                  {new Date(node.lastHeartbeatAt).toLocaleString()}
                </td>
                <td>
                  <button
                    type="button"
                    className="node-list__assign"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssignClick(node.id);
                    }}
                  >
                    {t('nodeList.assign')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
