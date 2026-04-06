/**
 * NodeCard displays detailed information for a single node.
 * Shows hostname, type, status, labels, registered/last-heartbeat timestamps,
 * and the list of assigned agents.
 */

import { useI18n } from '@/i18n/I18nProvider';
import type { Node } from '@/types/node';
import { NodeStatusBadge } from './NodeStatusBadge';
import styles from './nodes-feature.module.css';

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
  const { t } = useI18n();
  const labelEntries = Object.entries(node.labels);

  return (
    <article
      className={`${styles['node-card']}${isSelected ? ` ${styles['node-card--selected']}` : ''}`}
      data-node-id={node.id}
      data-node-status={node.status}
      style={{ cursor: onSelect ? 'pointer' : 'default' }}
      onClick={() => onSelect?.(node.id)}
    >
      <div className={styles['node-card__row']}>
        <div>
          <strong className={styles['node-card__hostname']}>{node.hostname}</strong>
          <div style={{ marginTop: '4px' }}>
            <span className={`${styles['node-card__type']} ${styles[`node-card__type--${node.nodeType}`] ?? ''}`}>
              {node.nodeType === 'k8s_pod' ? t('nodeCard.k8s') : t('nodeCard.bareMetal')}
            </span>
          </div>
        </div>
        <NodeStatusBadge status={node.status} />
      </div>

      {labelEntries.length > 0 && (
        <div className={styles['node-card__labels']}>
          {labelEntries.map(([key, value]) => (
            <span key={key} className={styles['node-card__label-pill']}>
              {key}={value}
            </span>
          ))}
        </div>
      )}

      <div className={styles['node-card__agents']}>
        <span className={styles['node-card__agents-label']}>{t('nodeCard.assignedLabel')}</span>
        {node.assignedAgents.length === 0 ? (
          <span className={`${styles['node-card__agents-value']} ${styles['node-card__agents-value--empty']}`}>{t('nodeCard.none')}</span>
        ) : (
          <span className={styles['node-card__agents-value']}>{node.assignedAgents.join(', ')}</span>
        )}
      </div>

      <div className={styles['node-card__timestamps']}>
        <div>
          {t('nodeCard.registered')} {new Date(node.registeredAt).toLocaleString()}
        </div>
        <div>
          {t('nodeCard.lastHeartbeat')} {new Date(node.lastHeartbeatAt).toLocaleString()}
        </div>
      </div>

      {onAssignClick && (
        <button
          type="button"
          className={styles['node-card__assign-btn']}
          onClick={(e) => {
            e.stopPropagation();
            onAssignClick(node.id);
          }}
        >
          {t('nodeCard.assignAgent')}
        </button>
      )}
    </article>
  );
};
