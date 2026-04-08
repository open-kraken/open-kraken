/**
 * Phase 5: Manage member modal — rename, view role, remove member.
 * Migrated from golutra's ManageMemberModal.vue.
 */

import { useState } from 'react';

type ManageMemberModalProps = {
  member: {
    id: string;
    displayName: string;
    roleType: string;
    avatar: string;
  };
  onRename: (memberId: string, newName: string) => void;
  onRemove: (memberId: string) => void;
  onClose: () => void;
  canRemove?: boolean;
};

export const ManageMemberModal = ({
  member,
  onRename,
  onRemove,
  onClose,
  canRemove = true,
}: ManageMemberModalProps) => {
  const [name, setName] = useState(member.displayName);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-card__header">
          <h2>Manage Member</h2>
          <button type="button" className="modal-card__close" onClick={onClose}>X</button>
        </header>
        <div className="modal-card__body">
          <div className="modal-card__member-info">
            <div className="modal-card__avatar">{member.avatar || member.displayName.charAt(0).toUpperCase()}</div>
            <span className="modal-card__role">{member.roleType}</span>
          </div>
          <div className="modal-card__field">
            <label htmlFor="manage-name">Display Name</label>
            <input
              id="manage-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="modal-card__input"
            />
          </div>
        </div>
        <footer className="modal-card__footer">
          {canRemove && (
            <button
              type="button"
              className="modal-card__btn modal-card__btn--danger"
              onClick={() => onRemove(member.id)}
            >
              Remove Member
            </button>
          )}
          <div className="modal-card__footer-spacer" />
          <button type="button" className="modal-card__btn modal-card__btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-card__btn modal-card__btn--primary"
            onClick={() => name.trim() && onRename(member.id, name.trim())}
            disabled={!name.trim() || name === member.displayName}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};
