/**
 * NodeStatusBadge renders a colour-coded pill for a node's health status.
 * online → green, degraded → orange, offline → red.
 */

import type { NodeStatus } from '@/types/node';

export type NodeStatusBadgeProps = {
  status: NodeStatus;
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  online: 'Online',
  degraded: 'Degraded',
  offline: 'Offline'
};

// Inline styles so the badge works without a dedicated CSS file.
// Map to semantic classes (node-status-badge--*) once a stylesheet is added.
const STATUS_STYLE: Record<NodeStatus, React.CSSProperties> = {
  online: { backgroundColor: '#16a34a', color: '#fff' },
  degraded: { backgroundColor: '#ea580c', color: '#fff' },
  offline: { backgroundColor: '#dc2626', color: '#fff' }
};

/**
 * NodeStatusBadge
 * Renders the node health state as a small labelled badge.
 *
 * @param status - The node's current NodeStatus value.
 */
export const NodeStatusBadge = ({ status }: NodeStatusBadgeProps) => {
  return (
    <span
      className={`node-status-badge node-status-badge--${status}`}
      style={{
        ...STATUS_STYLE[status],
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.02em'
      }}
      aria-label={`Node status: ${STATUS_LABEL[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
};
