/**
 * NodeStatusBadge renders a colour-coded pill for a node's health status.
 * online → green, degraded → orange, offline → red.
 */

import { useI18n } from '@/i18n/I18nProvider';
import type { NodeStatus } from '@/types/node';
import styles from './nodes-feature.module.css';

export type NodeStatusBadgeProps = {
  status: NodeStatus;
};

/**
 * NodeStatusBadge
 * Renders the node health state as a small labelled badge.
 *
 * @param status - The node's current NodeStatus value.
 */
export const NodeStatusBadge = ({ status }: NodeStatusBadgeProps) => {
  const { t } = useI18n();
  const label = t(`nodeStatus.${status}`);
  const toneClass =
    status === 'online'
      ? styles['node-status-badge--online']
      : status === 'degraded'
        ? styles['node-status-badge--degraded']
        : styles['node-status-badge--offline'];
  return (
    <span
      className={`${styles['node-status-badge']} ${toneClass}`}
      aria-label={t('nodeCard.statusAria', { status: label })}
    >
      {label}
    </span>
  );
};
