/**
 * NodeAgentAssign — dialog for assigning or removing agents on a node (T08).
 * Presents a list of all workspace members; assigned ones show a remove action,
 * unassigned ones show an add action.
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Node } from '@/types/node';

export type AgentOption = {
  memberId: string;
  displayName: string;
};

export type NodeAgentAssignProps = {
  node: Node;
  allAgents: AgentOption[];
  onAssign: (nodeId: string, memberId: string) => Promise<void>;
  onUnassign: (nodeId: string, memberId: string) => Promise<void>;
  onClose: () => void;
};

/**
 * NodeAgentAssign
 * Modal dialog for managing which agents are assigned to a specific node.
 *
 * @param node - The node whose assignments are being edited.
 * @param allAgents - Full list of workspace agents to display.
 * @param onAssign - Called when user clicks "Assign" for an unassigned agent.
 * @param onUnassign - Called when user clicks "Remove" for an assigned agent.
 * @param onClose - Called when the dialog should be dismissed.
 */
export const NodeAgentAssign = ({ node, allAgents, onAssign, onUnassign, onClose }: NodeAgentAssignProps) => {
  const { t } = useI18n();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const handleAssign = async (memberId: string) => {
    setPendingIds((prev) => new Set(prev).add(memberId));
    try {
      await onAssign(node.id, memberId);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  };

  const handleUnassign = async (memberId: string) => {
    setPendingIds((prev) => new Set(prev).add(memberId));
    try {
      await onUnassign(node.id, memberId);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-assign-dialog-title"
      className="node-assign-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="node-assign-dialog">
        <div className="node-assign-dialog__header">
          <h2 id="node-assign-dialog-title" className="node-assign-dialog__title">
            {t('nodeAssign.title', { hostname: node.hostname })}
          </h2>
          <button type="button" aria-label={t('nodeAssign.close')} className="node-assign-dialog__close" onClick={onClose}>
            ✕
          </button>
        </div>

        {allAgents.length === 0 ? (
          <p className="node-assign-dialog__empty">{t('nodeAssign.empty')}</p>
        ) : (
          <ul className="node-assign-dialog__list">
            {allAgents.map((agent) => {
              const isAssigned = node.assignedAgents.includes(agent.memberId);
              const isPending = pendingIds.has(agent.memberId);

              return (
                <li key={agent.memberId} className="node-assign-dialog__row">
                  <span className="node-assign-dialog__name">{agent.displayName}</span>
                  <button
                    type="button"
                    disabled={isPending}
                    className={`node-assign-dialog__action ${isAssigned ? 'node-assign-dialog__action--remove' : 'node-assign-dialog__action--add'}`}
                    onClick={() => (isAssigned ? handleUnassign(agent.memberId) : handleAssign(agent.memberId))}
                  >
                    {isPending ? t('nodeAssign.pending') : isAssigned ? t('nodeAssign.remove') : t('nodeAssign.assign')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="node-assign-dialog__footer">
          <button type="button" className="node-assign-dialog__done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
