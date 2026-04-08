/**
 * ConfirmDialog — confirmation before destructive actions.
 * Reference: GitHub's "type repo name to confirm" pattern.
 */

import { createPortal } from 'react-dom';

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialog = (
    <div
      className="modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="modal-card confirm-dialog" data-tone={tone}>
        <header className="modal-card__header">
          <h2 id="confirm-dialog-title">{title}</h2>
        </header>
        <div className="modal-card__body">
          <p id="confirm-dialog-desc" className="confirm-dialog__desc">{description}</p>
        </div>
        <footer className="modal-card__footer">
          <button type="button" className="modal-card__btn modal-card__btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`modal-card__btn ${tone === 'danger' ? 'modal-card__btn--danger' : 'modal-card__btn--primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
  return createPortal(dialog, document.body);
};
