/**
 * Phase 5: Invite friend/member modal.
 * Migrated from golutra's InviteFriendsModal.vue.
 */

import { useState } from 'react';

type InviteFriendModalProps = {
  onInvite: (displayName: string, roleType: string) => void;
  onClose: () => void;
};

const ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'admin', label: 'Admin' },
];

export const InviteFriendModal = ({ onInvite, onClose }: InviteFriendModalProps) => {
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('member');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-card__header">
          <h2>Invite Member</h2>
          <button type="button" className="modal-card__close" onClick={onClose}>X</button>
        </header>
        <div className="modal-card__body">
          <div className="modal-card__field">
            <label htmlFor="invite-name">Display Name</label>
            <input
              id="invite-name"
              type="text"
              placeholder="Enter display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="modal-card__input"
            />
          </div>
          <div className="modal-card__field">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="modal-card__select"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <footer className="modal-card__footer">
          <button type="button" className="modal-card__btn modal-card__btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-card__btn modal-card__btn--primary"
            onClick={() => displayName.trim() && onInvite(displayName.trim(), role)}
            disabled={!displayName.trim()}
          >
            Invite
          </button>
        </footer>
      </div>
    </div>
  );
};
