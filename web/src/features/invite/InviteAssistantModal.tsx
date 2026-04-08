/**
 * Phase 5: Invite AI assistant modal — select AI provider and configure instance.
 * Migrated from golutra's InviteAssistantModal.vue.
 */

import { useState } from 'react';

export type ProviderOption = {
  id: string;
  terminalType: string;
  displayName: string;
  icon: string;
};

type InviteAssistantModalProps = {
  providers: ProviderOption[];
  onInvite: (provider: ProviderOption, customCommand: string) => void;
  onClose: () => void;
};

export const InviteAssistantModal = ({ providers, onInvite, onClose }: InviteAssistantModalProps) => {
  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? '');
  const [customCommand, setCustomCommand] = useState('');

  const selected = providers.find((p) => p.id === selectedId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-card__header">
          <h2>Invite AI Assistant</h2>
          <button type="button" className="modal-card__close" onClick={onClose}>X</button>
        </header>
        <div className="modal-card__body">
          <div className="modal-card__field">
            <label htmlFor="invite-provider">AI Provider</label>
            <select
              id="invite-provider"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="modal-card__select"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-card__field">
            <label htmlFor="invite-command">Custom Command (optional)</label>
            <input
              id="invite-command"
              type="text"
              placeholder={selected?.terminalType ?? 'default command'}
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
              className="modal-card__input"
            />
          </div>
        </div>
        <footer className="modal-card__footer">
          <button type="button" className="modal-card__btn modal-card__btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-card__btn modal-card__btn--primary"
            onClick={() => selected && onInvite(selected, customCommand)}
            disabled={!selected}
          >
            Invite
          </button>
        </footer>
      </div>
    </div>
  );
};
