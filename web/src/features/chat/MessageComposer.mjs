import { escapeHtml } from './contracts.mjs';

export const buildMessageComposerView = ({
  composerState,
  composerAvailability,
  onComposerChange = () => {},
  onComposerSubmit = () => {},
  onComposerRetry = () => {}
}) => ({
  draft: composerState.draft,
  status: composerState.status,
  errorMessage: composerState.errorMessage,
  disabled: composerAvailability.disabled,
  disabledReason: composerAvailability.reason,
  canRetry: composerState.status === 'failed',
  onChange: (draft) => {
    if (composerAvailability.disabled) {
      return;
    }
    onComposerChange(draft);
  },
  onSubmit: () => {
    if (composerAvailability.disabled) {
      return;
    }
    onComposerSubmit(composerState.draft);
  },
  onRetry: () => {
    if (composerAvailability.disabled) {
      return;
    }
    onComposerRetry(composerState.draft);
  }
});

export const renderMessageComposer = (view) => `<form class="chat-composer" data-composer-status="${escapeHtml(view.status)}" data-composer-disabled="${String(view.disabled)}" data-disabled-reason="${escapeHtml(view.disabledReason ?? '')}" data-can-retry="${String(view.canRetry)}">
  <textarea class="chat-composer__input">${escapeHtml(view.draft)}</textarea>
  <button class="chat-composer__submit" data-disabled="${String(view.disabled)}">Send</button>
  <button class="chat-composer__retry" data-visible="${String(view.canRetry)}">Retry</button>
</form>`;
