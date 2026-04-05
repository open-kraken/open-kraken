/**
 * NodeList renders a tabular view of all registered nodes (T08).
 * Columns: hostname / type / status / assigned agents count / last heartbeat.
 * Clicking a row selects it; the Assign action opens the assignment dialog.
 */

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
  if (nodes.length === 0) {
    return (
      <div
        className="node-list--empty"
        style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}
        role="status"
      >
        No nodes registered in this workspace.
      </div>
    );
  }

  return (
    <div className="node-list" style={{ overflowX: 'auto' }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
        aria-label="Registered nodes"
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Hostname</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Type</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Assigned agents</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Last heartbeat</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Actions</th>
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
                style={{
                  borderBottom: '1px solid #1f2937',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(99,102,241,0.07)' : 'transparent'
                }}
                aria-selected={isSelected}
              >
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{node.hostname}</td>
                <td style={{ padding: '10px 12px', color: '#9ca3af' }}>
                  {node.nodeType === 'k8s_pod' ? 'K8s Pod' : 'Bare Metal'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <NodeStatusBadge status={node.status} />
                </td>
                <td style={{ padding: '10px 12px', color: node.assignedAgents.length === 0 ? '#6b7280' : '#e5e7eb' }}>
                  {node.assignedAgents.length === 0
                    ? 'None'
                    : `${node.assignedAgents.length} agent${node.assignedAgents.length > 1 ? 's' : ''}`}
                </td>
                <td style={{ padding: '10px 12px', color: '#9ca3af', fontSize: '0.8rem' }}>
                  {new Date(node.lastHeartbeatAt).toLocaleString()}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssignClick(node.id);
                    }}
                    style={{
                      fontSize: '0.75rem',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      border: '1px solid #6366f1',
                      color: '#6366f1',
                      background: 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    Assign
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
