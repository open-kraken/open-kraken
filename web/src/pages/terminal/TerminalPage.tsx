import { useCallback, useEffect, useMemo, useState } from 'react';
import { RoleCard } from '@/components/agent/RoleCard';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { TerminalPanel } from '@/features/terminal/TerminalPanel';
import { normalizeMembersEnvelope, type MemberFixture } from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { sendTerminalInput, closeTerminalSession } from '@/api/terminal';
import { useTerminalPanelRuntime } from './terminal-runtime';

const terminalEventVocabulary = ['terminal.attach', 'terminal.snapshot', 'terminal.delta', 'terminal.status'];
const defaultTerminalId = 'term_owner_1';

const terminalIdForMember = (memberId: string) => `term_${memberId}`;

export const TerminalPage = () => {
  const { t } = useI18n();
  const { realtime, workspace, apiClient, realtimeClient, pushNotification } = useAppShell();
  const terminalUiRules = useMemo(
    () => [t('terminal.rule1'), t('terminal.rule2'), t('terminal.rule3'), t('terminal.rule4')],
    [t]
  );
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
  const [closingSession, setClosingSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getMembers()
      .then((response) => {
        if (cancelled) return;
        setRoster(normalizeMembersEnvelope(response));
      })
      .catch(() => {
        if (cancelled) return;
        setRoster([]);
      });
    return () => { cancelled = true; };
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

  /** Send text input to the active terminal session. */
  const handleSendInput = useCallback((data: string) => {
    const sessionId = terminalRuntime.state.session?.terminalId;
    if (!sessionId) return;
    void sendTerminalInput(sessionId, data + '\n').catch((err) => {
      pushNotification({
        tone: 'error',
        title: t('terminal.inputError'),
        detail: err instanceof Error ? err.message : 'Input send failed'
      });
    });
  }, [terminalRuntime.state.session?.terminalId, pushNotification, t]);

  /** Close the active terminal session. */
  const handleCloseSession = useCallback(async () => {
    const sessionId = terminalRuntime.state.session?.terminalId;
    if (!sessionId) return;
    setClosingSession(true);
    try {
      await closeTerminalSession(sessionId);
      pushNotification({
        tone: 'info',
        title: t('terminal.sessionClosed'),
        detail: `Session ${sessionId} closed.`
      });
    } catch (err) {
      pushNotification({
        tone: 'error',
        title: t('terminal.closeError'),
        detail: err instanceof Error ? err.message : 'Close failed'
      });
    } finally {
      setClosingSession(false);
    }
  }, [terminalRuntime.state.session?.terminalId, pushNotification, t]);

  return (
    <section className="page-card page-card--terminal" data-route-page="terminal">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('terminal.eyebrow')}</p>
          <h1>{t('terminal.title')}</h1>
          <p className="route-page__intro">{t('terminal.intro')}</p>
        </div>
        <div className="route-page__metric-strip" aria-label={t('terminal.recoveryAria')}>
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('terminal.metric.realtimeDetail')}</span>
            <strong>{translateRealtimeStatusLabel(realtime.status, t)}</strong>
            <small>{translateRealtimeDetail(realtime.detail, t)}</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('terminal.metric.resumeCursor')}</span>
            <strong>{realtime.lastCursor ?? t('terminal.none')}</strong>
            <small>{t('terminal.metric.resumeHint')}</small>
          </article>
        </div>
      </div>

      <section className="terminal-session-picker" aria-label={t('terminal.pickerAria')}>
        <header className="terminal-session-picker__header">
          <div>
            <p className="page-eyebrow">{t('terminal.streamsEyebrow')}</p>
            <h2 className="terminal-session-picker__title">{t('terminal.streamsTitle')}</h2>
          </div>
          <span className="route-page__status-pill">
            {t('terminal.active')} {activeTerminalId}
          </span>
        </header>
        <ul className="terminal-session-picker__list">
          {roster.length === 0 ? (
            <li className="terminal-session-picker__empty">{t('terminal.loadingRoster')}</li>
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
                      <span>{member.terminalStatus ?? t('terminal.unknown')}</span>
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
              <p className="page-eyebrow">{t('terminal.flowEyebrow')}</p>
              <h2>{t('terminal.recoveryTitle')}</h2>
            </div>
            <span className="route-page__status-pill route-page__status-pill--live">{t('terminal.seqAware')}</span>
          </header>
          <ol className="route-page__timeline">
            <li>
              <strong>terminal.attach</strong>
              <p>{t('terminal.attachStep', { workspaceId: workspace.workspaceId })}</p>
            </li>
            <li>
              <strong>terminal.snapshot</strong>
              <p>{t('terminal.snapshotStep')}</p>
            </li>
            <li>
              <strong>terminal.delta</strong>
              <p>{t('terminal.deltaStep')}</p>
            </li>
            <li>
              <strong>terminal.status</strong>
              <p>{t('terminal.statusStep')}</p>
            </li>
          </ol>
        </section>

        <section className="route-page__panel route-page__panel--stream">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('terminal.outputEyebrow')}</p>
              <h2>{t('terminal.bufferTitle')}</h2>
            </div>
          </header>
          <div data-terminal-runtime="connected-panel">
            <TerminalPanel
              state={terminalRuntime.state}
              onAttach={() => { void terminalRuntime.attach(); }}
              onRetry={() => { void terminalRuntime.retry(); }}
              onToggleFollow={() => { terminalRuntime.toggleFollow(); }}
              onSendInput={handleSendInput}
            />
          </div>
        </section>

        <section className="route-page__panel route-page__panel--side">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('terminal.ownerEyebrow')}</p>
              <h2>{t('terminal.visibleStatus')}</h2>
            </div>
          </header>
          <div className="route-page__role-stack">
            <RoleCard
              avatarInitial="TM"
              name={
                terminalRuntime.state.session?.memberId
                  ? t('terminal.memberSession', { id: terminalRuntime.state.session.memberId })
                  : t('terminal.sessionLabel')
              }
              role="member"
              status={terminalRuntime.state.runtime.process === 'running' ? 'running' : realtime.status === 'connected' ? 'idle' : 'offline'}
              summary={t('terminal.streamSummary', {
                id: terminalRuntime.state.activeTerminalId ?? t('terminal.none'),
                cmd: terminalRuntime.state.session?.command ?? t('terminal.noCommand'),
                status: terminalRuntime.state.runtime.statusLabel
              })}
            />
            {/* Session control actions */}
            <div className="terminal-session-controls">
              <button
                type="button"
                className="terminal-session-controls__close"
                onClick={() => void handleCloseSession()}
                disabled={!terminalRuntime.state.session?.terminalId || closingSession}
              >
                {closingSession ? t('terminal.closing') : t('terminal.closeSession')}
              </button>
            </div>
          </div>
        </section>

        <section className="route-page__panel route-page__panel--rules">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('terminal.protocolEyebrow')}</p>
              <h2>{t('terminal.canonicalTitle')}</h2>
            </div>
          </header>
          <div className="route-page__rule-group">
            <h3>{t('terminal.canonicalEvents')}</h3>
            <ul className="route-page__rule-list">
              {terminalEventVocabulary.map((eventName) => (
                <li key={eventName}>{eventName}</li>
              ))}
            </ul>
          </div>
          <div className="route-page__rule-group">
            <h3>{t('terminal.replayDedupe')}</h3>
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
