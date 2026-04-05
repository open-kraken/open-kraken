import {
  selectTerminalPanelViewModel
} from './terminal-store.ts';
import type { TerminalPanelState } from './terminal-types.ts';

export type TerminalPanelProps = {
  state: TerminalPanelState;
  onAttach: () => void;
  onRetry: () => void;
  onToggleFollow: () => void;
};

export const TerminalPanel = ({
  state,
  onAttach,
  onRetry,
  onToggleFollow
}: TerminalPanelProps) => {
  const view = selectTerminalPanelViewModel(state);
  const onPrimaryAction = view.primaryAction.kind === 'retry' ? onRetry : onAttach;

  return (
    <section
      data-ui-state={view.uiState}
      data-follow-output={String(view.followOutput)}
      aria-label="terminal-panel"
    >
      <header>
        <div>
          <h2>{view.title}</h2>
          <p>{view.body}</p>
          <p data-role="session-identity">
            {state.session
              ? `${state.session.terminalId} / ${state.session.memberId}`
              : 'No active terminal session'}
          </p>
        </div>
        <span data-role="status-badge">{view.statusBadge}</span>
      </header>

      <div>
        <button type="button" onClick={onPrimaryAction}>
          {view.primaryAction.label}
        </button>
        <button type="button" onClick={onToggleFollow}>
          {view.autoScrollHint}
        </button>
      </div>

      {view.errorMessage ? <p data-role="terminal-error">{view.errorMessage}</p> : null}

      {view.showOutput ? (
        <pre data-role="terminal-output">{view.outputText}</pre>
      ) : (
        <div data-role="terminal-empty">{view.body}</div>
      )}
    </section>
  );
};
