import { useCallback, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { selectTerminalPanelViewModel } from './terminal-store.ts';
import type { TerminalPanelState } from './terminal-types.ts';

export type TerminalPanelProps = {
  state: TerminalPanelState;
  onAttach: () => void;
  onRetry: () => void;
  onToggleFollow: () => void;
  onSendInput?: (data: string) => void;
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
  onSendInput
}: TerminalPanelProps) => {
  const { t } = useI18n();
  const view = selectTerminalPanelViewModel(state);
  const onPrimaryAction = view.primaryAction.kind === 'retry' ? onRetry : onAttach;
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const title = state.session?.command ?? t('terminalPanel.title');
  const body =
    view.uiState === 'error'
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
  const followHint = view.followOutput ? t('terminalPanel.followOn') : t('terminalPanel.followOff');

  const isAttached = state.runtime.connection === 'attached' && state.runtime.process === 'running';

  const handleInputSubmit = useCallback(() => {
    const data = inputValue;
    if (!data || !onSendInput) return;
    onSendInput(data);
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, onSendInput]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputSubmit();
    }
  }, [handleInputSubmit]);

  return (
    <section
      data-ui-state={view.uiState}
      data-follow-output={String(view.followOutput)}
      aria-label="terminal-panel"
    >
      <header>
        <div>
          <h2>{title}</h2>
          <p>{body}</p>
          <p data-role="session-identity">
            {state.session
              ? `${state.session.terminalId} / ${state.session.memberId}`
              : t('terminalPanel.noSession')}
          </p>
        </div>
        <span data-role="status-badge">{statusBadge}</span>
      </header>

      <div>
        <button type="button" onClick={onPrimaryAction}>
          {primaryLabel}
        </button>
        <button type="button" onClick={onToggleFollow}>
          {followHint}
        </button>
      </div>

      {view.errorMessage ? <p data-role="terminal-error">{view.errorMessage}</p> : null}

      {view.showOutput ? (
        <pre data-role="terminal-output">{view.outputText}</pre>
      ) : (
        <div data-role="terminal-empty">{body}</div>
      )}

      {/* Terminal input — visible when session is attached and running */}
      {onSendInput && (
        <div className="terminal-panel__input" data-role="terminal-input">
          <span className="terminal-panel__prompt">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={isAttached ? t('terminalPanel.inputPlaceholder') : t('terminalPanel.inputDisabled')}
            disabled={!isAttached}
            aria-label={t('terminalPanel.inputAria')}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleInputSubmit}
            disabled={!isAttached || inputValue.length === 0}
            className="terminal-panel__send"
          >
            {t('terminalPanel.inputSend')}
          </button>
        </div>
      )}
    </section>
  );
};
