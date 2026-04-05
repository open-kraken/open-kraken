import { useCallback, useEffect, useMemo, useState } from 'react';
import { RoleCard } from '@/components/agent/RoleCard';
import { TerminalPanel } from '@/features/terminal/TerminalPanel';
import { normalizeMembersEnvelope, type MemberFixture } from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { useTerminalPanelRuntime } from './terminal-runtime';

const terminalEventVocabulary = ['terminal.attach', 'terminal.snapshot', 'terminal.delta', 'terminal.status'];
const terminalUiRules = [
  'Attach rebases the active terminal session before buffered output is trusted.',
  'Snapshot is authoritative and replaces the rendered buffer when its seq is newer than the accepted buffer.',
  'Delta appends only when seq is strictly newer than the active terminal buffer state.',
  'Status updates connectionState and processState together without mutating buffered output text.'
];

const defaultTerminalId = 'term_owner_1';

const terminalIdForMember = (memberId: string) => `term_${memberId}`;

export const TerminalPage = () => {
  const { realtime, workspace, apiClient, realtimeClient, pushNotification } = useAppShell();
  const bootTerminalId = useMemo(() => {
    if (typeof window === 'undefined') {
      return defaultTerminalId;
    }
    const raw = window.location.hash.replace(/^#/, '').trim();
    return raw.startsWith('term_') ? raw : defaultTerminalId;
  }, []);

  const terminalRuntime = useTerminalPanelRuntime({
    apiClient,
    realtimeClient,
    pushNotification,
    initialTerminalId: bootTerminalId
  });

  const [roster, setRoster] = useState<MemberFixture[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getMembers()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setRoster(normalizeMembersEnvelope(response));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setRoster([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const setHashForTerminal = useCallback((terminalId: string) => {
    window.history.replaceState({}, '', `${window.location.pathname}#${terminalId}`);
  }, []);

  const selectSession = useCallback(
    (terminalId: string) => {
      setHashForTerminal(terminalId);
      void terminalRuntime.attachTo(terminalId);
    },
    [setHashForTerminal, terminalRuntime]
  );

  useEffect(() => {
    const onHash = () => {
      const raw = window.location.hash.replace(/^#/, '').trim();
      if (raw.startsWith('term_')) {
        void terminalRuntime.attachTo(raw);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [terminalRuntime]);

  const activeTerminalId =
    terminalRuntime.state.activeTerminalId ?? terminalRuntime.state.session?.terminalId ?? bootTerminalId;

  return (
    <section className="page-card page-card--terminal" data-route-page="terminal">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">Sessions</p>
          <h1>Session attach and output stream shell</h1>
          <p className="route-page__intro">
            Each workspace member maps to a <strong>terminal id</strong> using the UI convention{' '}
            <code>term_&lt;memberId&gt;</code>. Pick a row below to attach the PTY stream for that agent; roadmap tasks
            on the Team page describe <em>what</em> they are doing — this page shows <em>how it runs</em> in the shell.
          </p>
        </div>
        <div className="route-page__metric-strip" aria-label="terminal recovery strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">Realtime detail</span>
            <strong>{realtime.status}</strong>
            <small>{realtime.detail}</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">Resume cursor</span>
            <strong>{realtime.lastCursor ?? 'none'}</strong>
            <small>Used for reconnect-safe replay</small>
          </article>
        </div>
      </div>

      <section className="terminal-session-picker" aria-label="Per-agent terminal sessions">
        <header className="terminal-session-picker__header">
          <div>
            <p className="page-eyebrow">Agent streams</p>
            <h2 className="terminal-session-picker__title">Choose whose execution to watch</h2>
          </div>
          <span className="route-page__status-pill">Active: {activeTerminalId}</span>
        </header>
        <ul className="terminal-session-picker__list">
          {roster.length === 0 ? (
            <li className="terminal-session-picker__empty">Loading roster…</li>
          ) : (
            roster.map((member) => {
              const tid = terminalIdForMember(member.memberId);
              const selected = tid === activeTerminalId;
              return (
                <li key={member.memberId}>
                  <button
                    type="button"
                    className={selected ? 'terminal-session-picker__row is-active' : 'terminal-session-picker__row'}
                    data-terminal-id={tid}
                    data-member-id={member.memberId}
                    onClick={() => selectSession(tid)}
                  >
                    <span className="terminal-session-picker__name">{member.displayName ?? member.memberId}</span>
                    <span className="terminal-session-picker__meta">
                      <code>{tid}</code>
                      <span className="terminal-session-picker__sep">·</span>
                      <span>{member.terminalStatus ?? 'unknown'}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <div className="route-page__grid route-page__grid--terminal">
        <section className="route-page__panel route-page__panel--timeline">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Terminal flow</p>
              <h2>Recovery chain</h2>
            </div>
            <span className="route-page__status-pill route-page__status-pill--live">Seq aware</span>
          </header>
          <ol className="route-page__timeline">
            <li>
              <strong>terminal.attach</strong>
              <p>Claim the active session for {workspace.workspaceId} before output becomes visible.</p>
            </li>
            <li>
              <strong>terminal.snapshot</strong>
              <p>Paint the authoritative buffer once so reconnects do not replay stale fragments as fresh output.</p>
            </li>
            <li>
              <strong>terminal.delta</strong>
              <p>Append only newer seq values; duplicate or older frames stay suppressed in the UI layer.</p>
            </li>
            <li>
              <strong>terminal.status</strong>
              <p>Surface attach loss, running state, and completion without forcing a second page-level status system.</p>
            </li>
          </ol>
        </section>

        <section className="route-page__panel route-page__panel--stream">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Output preview</p>
              <h2>Replay-safe buffer</h2>
            </div>
          </header>
          <div data-terminal-runtime="connected-panel">
            <TerminalPanel
              state={terminalRuntime.state}
              onAttach={() => {
                void terminalRuntime.attach();
              }}
              onRetry={() => {
                void terminalRuntime.retry();
              }}
              onToggleFollow={() => {
                terminalRuntime.toggleFollow();
              }}
            />
          </div>
        </section>

        <section className="route-page__panel route-page__panel--side">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Session owner</p>
              <h2>Visible runtime status</h2>
            </div>
          </header>
          <div className="route-page__role-stack">
            <RoleCard
              avatarInitial="TM"
              name={terminalRuntime.state.session?.memberId ? `Member ${terminalRuntime.state.session.memberId}` : 'Terminal session'}
              role="member"
              status={terminalRuntime.state.runtime.process === 'running' ? 'running' : realtime.status === 'connected' ? 'idle' : 'offline'}
              summary={`Stream ${terminalRuntime.state.activeTerminalId ?? 'none'} · ${terminalRuntime.state.session?.command ?? 'no command metadata'} · ${terminalRuntime.state.runtime.statusLabel}`}
            />
          </div>
        </section>

        <section className="route-page__panel route-page__panel--rules">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Protocol contract</p>
              <h2>Canonical names and UI rules</h2>
            </div>
          </header>
          <div className="route-page__rule-group">
            <h3>Canonical events</h3>
            <ul className="route-page__rule-list">
              {terminalEventVocabulary.map((eventName) => (
                <li key={eventName}>{eventName}</li>
              ))}
            </ul>
          </div>
          <div className="route-page__rule-group">
            <h3>Replay and dedupe</h3>
            <ul className="route-page__rule-list">
              {terminalUiRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
};
