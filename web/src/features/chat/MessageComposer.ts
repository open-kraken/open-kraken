import { escapeHtml, type ComposerAvailability } from './contracts';

type ComposerStateNormalized = {
  draft: string;
  status: string;
  errorMessage: string | null;
};

type MessageComposerInput = {
  composerState: ComposerStateNormalized;
  composerAvailability: ComposerAvailability;
  onComposerChange?: (draft: string) => void;
  onComposerSubmit?: (draft: string) => void;
  onComposerRetry?: (draft: string) => void;
};

export type MessageComposerView = {
  draft: string;
  status: string;
  errorMessage: string | null;
  disabled: boolean;
  disabledReason: string | null;
  canRetry: boolean;
  onChange: (draft: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
};

export const buildMessageComposerView = ({
  composerState,
  composerAvailability,
  onComposerChange = () => {},
  onComposerSubmit = () => {},
  onComposerRetry = () => {}
}: MessageComposerInput): MessageComposerView => ({
  draft: composerState.draft,
  status: composerState.status,
  errorMessage: composerState.errorMessage,
  disabled: composerAvailability.disabled,
  disabledReason: composerAvailability.reason,
  canRetry: composerState.status === 'failed',
  onChange: (draft: string) => {
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

export const renderMessageComposer = (view: MessageComposerView): string => `<form class="chat-composer" data-composer-status="${escapeHtml(view.status)}" data-composer-disabled="${String(view.disabled)}" data-disabled-reason="${escapeHtml(view.disabledReason ?? '')}" data-can-retry="${String(view.canRetry)}">
  <textarea class="chat-composer__input">${escapeHtml(view.draft)}</textarea>
  <button class="chat-composer__submit" data-disabled="${String(view.disabled)}">Send</button>
  <button class="chat-composer__retry" data-visible="${String(view.canRetry)}">Retry</button>
</form>`;
