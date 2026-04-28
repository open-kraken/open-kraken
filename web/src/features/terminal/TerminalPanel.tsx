import { useCallback, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { selectTerminalPanelViewModel } from './terminal-store.ts';
import type { TerminalPanelState } from './terminal-types.ts';
import { XtermRenderer } from './XtermRenderer';

export type TerminalPanelProps = {
  state: TerminalPanelState;
  onAttach: () => void;
  onRetry: () => void;
  onToggleFollow: () => void;
  onSendInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onAckBytes?: (n: number) => void;
};

const runtimeLabel = (raw: string, t: (k: string) => string) => {
  const map: Record<string, string> = {
    Idle: t('terminalRuntime.idle'),
    Connecting: t('terminalRuntime.connecting'),
    'Attach Failed': t('terminalRuntime.attachFailed'),
    Attached: t('terminalRuntime.attached')
  };
  return map[raw] ?? raw;
};

export const TerminalPanel = ({
  state,
  onAttach,
  onRetry,
  onToggleFollow,
  onSendInput,
  onResize,
  onAckBytes,
}: TerminalPanelProps) => {
  const { t } = useI18n();
  const view = selectTerminalPanelViewModel(state);
  const onPrimaryAction = view.primaryAction.kind === 'retry' ? onRetry : onAttach;
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const title = state.session?.command ?? t('terminalPanel.title');
  const body =
    state.runtime.connection === 'disconnected'
      ? 'Realtime disconnected. Terminal output is paused until the connection is restored.'
      : view.uiState === 'error'
      ? view.body
      : view.uiState === 'connecting'
        ? t('terminalPanel.connectingBody')
        : view.uiState === 'exited'
          ? view.showOutput
            ? t('terminalPanel.exitedWithOutput')
            : t('terminalPanel.exitedNoOutput')
          : view.uiState === 'attached-output'
            ? t('terminalPanel.liveBody')
            : t('terminalPanel.attachPrompt');

  const statusBadge = `${runtimeLabel(state.runtime.statusLabel, t)} / ${t(`conn.${state.runtime.connection}`)}`;

  const primaryLabel =
    view.primaryAction.kind === 'retry' ? t('terminalPanel.retry') : t('terminalPanel.attach');
  const followHint =
    state.runtime.connection === 'disconnected'
      ? 'Output paused'
      : view.followOutput
        ? t('terminalPanel.followOn')
        : t('terminalPanel.followOff');

  const canSendInput =
    state.runtime.connection === 'attached' &&
    state.runtime.process !== 'exited' &&
    state.runtime.process !== 'failed';
  const shouldShowTerminal = view.showOutput || state.runtime.connection === 'attached';

  const handleInputSubmit = useCallback(() => {
    const data = inputValue;
    if (!data || !onSendInput) return;
    onSendInput(data + '\r');
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, onSendInput]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputSubmit();
    }
  }, [handleInputSubmit]);

  // Forward xterm user input to the terminal session.
  const handleXtermInput = useCallback((data: string) => {
    onSendInput?.(data);
  }, [onSendInput]);

  return (
    <section
      className="terminal-panel"
      data-ui-state={view.uiState}
      data-follow-output={String(view.followOutput)}
      data-intelligence-status={view.intelligenceStatus}
      aria-label="terminal-panel"
    >
      <header className="terminal-panel__header">
        <div className="terminal-panel__meta">
          <h2 className="terminal-panel__title">{title}</h2>
          <p className="terminal-panel__body">{body}</p>
          <p className="terminal-panel__session-id" data-role="session-identity">
            {state.session
              ? `${state.session.terminalId} / ${state.session.memberId}`
              : t('terminalPanel.noSession')}
          </p>
        </div>
        <div className="terminal-panel__controls">
          <span className="terminal-panel__status-badge" data-role="status-badge" data-intelligence-status={view.intelligenceStatus}>
            {statusBadge}
          </span>
          <button type="button" className="terminal-panel__btn" onClick={onPrimaryAction}>
            {primaryLabel}
          </button>
          <button
            type="button"
            className="terminal-panel__btn terminal-panel__btn--subtle"
            onClick={onToggleFollow}
            disabled={state.runtime.connection === 'disconnected'}
          >
            {followHint}
          </button>
        </div>
      </header>

      {view.errorMessage ? (
        <p className="terminal-panel__error" data-role="terminal-error">{view.errorMessage}</p>
      ) : null}

      {/* Use XtermRenderer for real terminal output */}
      {shouldShowTerminal ? (
        <XtermRenderer
          key={state.session?.terminalId ?? state.activeTerminalId ?? 'terminal'}
          outputText={view.outputText}
          followOutput={view.followOutput}
          onInput={handleXtermInput}
          onResize={onResize}
          onAckBytes={onAckBytes}
          intelligenceStatus={view.intelligenceStatus}
          shellReady={view.shellReady}
        />
      ) : (
        <div className="terminal-panel__empty" data-role="terminal-empty">
          <p>{body}</p>
        </div>
      )}

      {/* Fallback text input for non-PTY mode */}
      {onSendInput && !shouldShowTerminal && (
        <div className="terminal-panel__input" data-role="terminal-input">
          <span className="terminal-panel__prompt">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={canSendInput ? t('terminalPanel.inputPlaceholder') : t('terminalPanel.inputDisabled')}
            disabled={!canSendInput}
            aria-label={t('terminalPanel.inputAria')}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleInputSubmit}
            disabled={!canSendInput || inputValue.length === 0}
            className="terminal-panel__send"
          >
            {t('terminalPanel.inputSend')}
          </button>
        </div>
      )}
    </section>
  );
};
