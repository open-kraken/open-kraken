/**
 * NodeCard displays detailed information for a single node.
 * Shows hostname, type, status, labels, registered/last-heartbeat timestamps,
 * and the list of assigned agents.
 */

import type { Node } from '@/types/node';
import { NodeStatusBadge } from './NodeStatusBadge';

export type NodeCardProps = {
  node: Node;
  /** If true, the card is visually highlighted as selected. */
  isSelected?: boolean;
  onSelect?: (nodeId: string) => void;
  onAssignClick?: (nodeId: string) => void;
};

/**
 * NodeCard
 * Renders all metadata for a node and exposes an action to open the agent-assign dialog.
 *
 * @param node - The node to display.
 * @param isSelected - Whether this card is the currently selected node.
 * @param onSelect - Callback when the card is clicked.
 * @param onAssignClick - Callback when the "Assign agent" button is clicked.
 */
export const NodeCard = ({ node, isSelected = false, onSelect, onAssignClick }: NodeCardProps) => {
  const labelEntries = Object.entries(node.labels);

  return (
    <article
      className={`node-card${isSelected ? ' node-card--selected' : ''}`}
      data-node-id={node.id}
      data-node-status={node.status}
      style={{
        border: `1px solid ${isSelected ? '#6366f1' : '#374151'}`,
        borderRadius: '8px',
        padding: '16px',
        cursor: onSelect ? 'pointer' : 'default',
        backgroundColor: isSelected ? 'rgba(99,102,241,0.05)' : 'transparent'
      }}
      onClick={() => onSelect?.(node.id)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <strong className="node-card__hostname" style={{ fontSize: '0.95rem' }}>
            {node.hostname}
          </strong>
          <div style={{ marginTop: '4px' }}>
            <span
              className={`node-card__type node-card__type--${node.nodeType}`}
              style={{
                fontSize: '0.75rem',
                color: '#9ca3af',
                marginRight: '8px'
              }}
            >
              {node.nodeType === 'k8s_pod' ? 'Kubernetes Pod' : 'Bare Metal'}
            </span>
          </div>
        </div>
        <NodeStatusBadge status={node.status} />
      </div>

      {/* Labels */}
      {labelEntries.length > 0 && (
        <div className="node-card__labels" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
          {labelEntries.map(([key, value]) => (
            <span
              key={key}
              style={{
                fontSize: '0.7rem',
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '3px',
                padding: '1px 6px',
                color: '#d1d5db'
              }}
            >
              {key}={value}
            </span>
          ))}
        </div>
      )}

      {/* Assigned agents */}
      <div className="node-card__agents" style={{ marginBottom: '10px' }}>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Assigned agents: </span>
        {node.assignedAgents.length === 0 ? (
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>None</span>
        ) : (
          <span style={{ fontSize: '0.75rem', color: '#e5e7eb' }}>
            {node.assignedAgents.join(', ')}
          </span>
        )}
      </div>

      {/* Timestamps */}
      <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '12px' }}>
        <div>Registered: {new Date(node.registeredAt).toLocaleString()}</div>
        <div>Last heartbeat: {new Date(node.lastHeartbeatAt).toLocaleString()}</div>
      </div>

      {onAssignClick && (
        <button
          type="button"
          className="node-card__assign-btn"
          style={{
            fontSize: '0.8rem',
            padding: '4px 12px',
            borderRadius: '4px',
            border: '1px solid #6366f1',
            color: '#6366f1',
            background: 'transparent',
            cursor: 'pointer'
          }}
          onClick={(e) => {
            e.stopPropagation();
            onAssignClick(node.id);
          }}
        >
          Assign agent
        </button>
      )}
    </article>
  );
};
