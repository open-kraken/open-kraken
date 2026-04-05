/**
 * NodeAgentAssign — dialog for assigning or removing agents on a node (T08).
 * Presents a list of all workspace members; assigned ones show a remove action,
 * unassigned ones show an add action.
 */

import { useState } from 'react';
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
  // Track in-flight requests per memberId to show loading state on the button
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
    // Backdrop
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-assign-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50
      }}
      onClick={(e) => {
        // Close when clicking the backdrop
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#111827',
          border: '1px solid #374151',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '360px',
          maxWidth: '480px',
          width: '100%'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 id="node-assign-dialog-title" style={{ margin: 0, fontSize: '1rem' }}>
            Assign agents — {node.hostname}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.25rem' }}
          >
            ✕
          </button>
        </div>

        {allAgents.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No agents available.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {allAgents.map((agent) => {
              const isAssigned = node.assignedAgents.includes(agent.memberId);
              const isPending = pendingIds.has(agent.memberId);

              return (
                <li
                  key={agent.memberId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: '#1f2937',
                    borderRadius: '6px'
                  }}
                >
                  <span style={{ fontSize: '0.875rem' }}>{agent.displayName}</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => isAssigned ? handleUnassign(agent.memberId) : handleAssign(agent.memberId)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      border: `1px solid ${isAssigned ? '#dc2626' : '#16a34a'}`,
                      color: isAssigned ? '#dc2626' : '#16a34a',
                      background: 'transparent',
                      cursor: isPending ? 'not-allowed' : 'pointer',
                      opacity: isPending ? 0.6 : 1
                    }}
                  >
                    {isPending ? '…' : isAssigned ? 'Remove' : 'Assign'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: '0.85rem',
              padding: '6px 16px',
              borderRadius: '4px',
              border: '1px solid #374151',
              color: '#9ca3af',
              background: 'transparent',
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
