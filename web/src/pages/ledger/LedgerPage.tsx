/**
 * Central ledger page — team / member / command context for post-incident review.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { getLedgerEvents } from '@/api/ledger';
import type { LedgerEvent } from '@/types/ledger';
import type { MemberFixture, TeamGroupFixture } from '@/features/members/member-page-model';

type TimePreset = '24h' | '7d' | 'all';

const EVENT_TYPE_PRESETS = ['', 'terminal.command', 'llm.call', 'tool.run', 'deploy', 'git.operation'] as const;

function formatLocalTime(iso: string): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

function contextPreview(ctx: Record<string, unknown>): string {
  if (!ctx || Object.keys(ctx).length === 0) {
    return '—';
  }
  try {
    return JSON.stringify(ctx, null, 0);
  } catch {
    return String(ctx);
  }
}

export const LedgerPage = () => {
  const { t } = useI18n();
  const { apiClient, workspace } = useAppShell();

  const [membersEnvelope, setMembersEnvelope] = useState<{
    members: MemberFixture[];
    teams: TeamGroupFixture[];
  }>({ members: [], teams: [] });

  const [timePreset, setTimePreset] = useState<TimePreset>('7d');
  const [teamId, setTeamId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [eventType, setEventType] = useState('');

  const [items, setItems] = useState<LedgerEvent[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { since, until } = useMemo(() => {
    if (timePreset === 'all') {
      return { since: undefined as string | undefined, until: undefined as string | undefined };
    }
    const end = new Date();
    const start = new Date(end);
    if (timePreset === '24h') {
      start.setHours(start.getHours() - 24);
    } else {
      start.setDate(start.getDate() - 7);
    }
    return { since: start.toISOString(), until: end.toISOString() };
  }, [timePreset]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.getMembers();
        if (cancelled) {
          return;
        }
        const teams = res.teams ?? [];
        const members = res.members ?? [];
        setMembersEnvelope({ members, teams });
      } catch {
        if (!cancelled) {
          setMembersEnvelope({ members: [], teams: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const teamOptions = useMemo(() => {
    const { teams, members } = membersEnvelope;
    if (teams.length > 0) {
      return teams.map((g) => ({ id: g.teamId, label: g.name ?? g.teamId }));
    }
    const ids = new Set<string>();
    for (const m of members) {
      if (m.teamId) {
        ids.add(m.teamId);
      }
    }
    return [...ids].sort().map((id) => ({ id, label: id }));
  }, [membersEnvelope]);

  const memberOptions = useMemo(() => {
    const { teams, members } = membersEnvelope;
    if (teamId && teams.length > 0) {
      const g = teams.find((x) => x.teamId === teamId);
      return g?.members ?? [];
    }
    if (teamId) {
      return members.filter((m) => m.teamId === teamId);
    }
    return members;
  }, [membersEnvelope, teamId]);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const res = await getLedgerEvents({
        workspaceId: workspace.workspaceId,
        teamId: teamId || undefined,
        memberId: memberId || undefined,
        eventType: eventType || undefined,
        since,
        until,
        limit: 200
      });
      setItems(res.items);
      setLoadState('success');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      setLoadState('error');
    }
  }, [workspace.workspaceId, teamId, memberId, eventType, since, until]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page-card ledger-page" data-route-page="ledger" data-page-entry="ledger-runtime">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('ledger.eyebrow')}</p>
          <h1>{t('ledger.title')}</h1>
          <p className="route-page__intro">{t('ledger.intro')}</p>
        </div>
      </div>

      <p className="ledger-hint">{t('ledger.hintVsDashboard')}</p>

      <div className="ledger-filters" aria-label={t('ledger.filtersAria')}>
        <div className="ledger-filters__field">
          <label htmlFor="ledger-preset">{t('ledger.timeRange')}</label>
          <select
            id="ledger-preset"
            value={timePreset}
            onChange={(ev) => setTimePreset(ev.target.value as TimePreset)}
          >
            <option value="24h">{t('ledger.preset24h')}</option>
            <option value="7d">{t('ledger.preset7d')}</option>
            <option value="all">{t('ledger.presetAll')}</option>
          </select>
        </div>
        <div className="ledger-filters__field">
          <label htmlFor="ledger-team">{t('ledger.team')}</label>
          <select
            id="ledger-team"
            value={teamId}
            onChange={(ev) => {
              setTeamId(ev.target.value);
              setMemberId('');
            }}
          >
            <option value="">{t('ledger.allTeams')}</option>
            {teamOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ledger-filters__field">
          <label htmlFor="ledger-member">{t('ledger.member')}</label>
          <select id="ledger-member" value={memberId} onChange={(ev) => setMemberId(ev.target.value)}>
            <option value="">{t('ledger.allMembers')}</option>
            {memberOptions.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.displayName ?? m.memberId}
              </option>
            ))}
          </select>
        </div>
        <div className="ledger-filters__field">
          <label htmlFor="ledger-type">{t('ledger.eventType')}</label>
          <select id="ledger-type" value={eventType} onChange={(ev) => setEventType(ev.target.value)}>
            {EVENT_TYPE_PRESETS.map((v) => (
              <option key={v || 'any'} value={v}>
                {v || t('ledger.anyType')}
              </option>
            ))}
          </select>
        </div>
        <div className="ledger-filters__actions">
          <button type="button" onClick={() => void load()}>
            {t('ledger.refresh')}
          </button>
        </div>
      </div>

      {loadState === 'error' && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: 'rgba(220,38,38,0.1)',
            border: '1px solid #dc2626',
            color: '#fca5a5'
          }}
        >
          {t('ledger.loadError', { message: errorMessage ?? '' })}
        </div>
      )}

      {loadState === 'loading' && items.length === 0 && (
        <div role="status" className="ledger-empty">
          {t('ledger.loading')}
        </div>
      )}

      {items.length === 0 && loadState === 'success' && (
        <div className="ledger-empty" role="status">
          {t('ledger.empty')}
        </div>
      )}

      {items.length > 0 && (
        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>{t('ledger.colTime')}</th>
                <th>{t('ledger.colTeam')}</th>
                <th>{t('ledger.colMember')}</th>
                <th>{t('ledger.colType')}</th>
                <th>{t('ledger.colSummary')}</th>
                <th>{t('ledger.colCorrelation')}</th>
                <th>{t('ledger.colSession')}</th>
                <th>{t('ledger.colContext')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <time dateTime={row.timestamp}>{formatLocalTime(row.timestamp)}</time>
                  </td>
                  <td>{row.teamId || '—'}</td>
                  <td>
                    <code>{row.memberId}</code>
                  </td>
                  <td>
                    <span className="ledger-type-pill">{row.eventType}</span>
                  </td>
                  <td>{row.summary}</td>
                  <td>
                    <code>{row.correlationId || '—'}</code>
                  </td>
                  <td>
                    <code>{row.sessionId || '—'}</code>
                  </td>
                  <td>
                    <pre className="ledger-context">{contextPreview(row.context)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
