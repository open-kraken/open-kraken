/**
 * LedgerPage — central audit trail for team / member / command context.
 *
 * Features:
 * - Filter by time range, team, member, node, event type, keyword search
 * - Expandable row detail with formatted JSON context
 * - Total / filtered count display
 * - Record new audit event (POST)
 * - Auto-refresh toggle
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { getLedgerEvents, createLedgerEvent } from '@/api/ledger';
import { getNodes } from '@/api/nodes';
import type { LedgerEvent } from '@/types/ledger';
import type { MemberFixture, TeamGroupFixture } from '@/features/members/member-page-model';
import type { Node } from '@/types/node';
import styles from '@/features/ledger/ledger-page.module.css';

type TimePreset = '1h' | '24h' | '7d' | '30d' | 'all';

const EVENT_TYPE_PRESETS = [
  '',
  'terminal.command',
  'llm.call',
  'tool.run',
  'deploy',
  'git.operation',
  'memory.write',
  'skill.assign'
] as const;

function formatLocalTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatContext(ctx: Record<string, unknown>): string {
  if (!ctx || Object.keys(ctx).length === 0) return '';
  try {
    return JSON.stringify(ctx, null, 2);
  } catch {
    return String(ctx);
  }
}

/** Derive the event-type pill color class suffix. */
function eventTypeTone(type: string): string {
  if (type.startsWith('terminal')) return 'terminal';
  if (type.startsWith('llm')) return 'llm';
  if (type.startsWith('tool')) return 'tool';
  if (type.startsWith('deploy')) return 'deploy';
  if (type.startsWith('git')) return 'git';
  return 'default';
}

export const LedgerPage = () => {
  const { t } = useI18n();
  const { apiClient, workspace } = useAppShell();

  // ── Roster (teams + members) for filter dropdowns ──
  const [membersEnvelope, setMembersEnvelope] = useState<{
    members: MemberFixture[];
    teams: TeamGroupFixture[];
  }>({ members: [], teams: [] });

  // ── Nodes for filter dropdown ──
  const [nodes, setNodes] = useState<Node[]>([]);

  // ── Filters ──
  const [timePreset, setTimePreset] = useState<TimePreset>('7d');
  const [teamId, setTeamId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [eventType, setEventType] = useState('');
  const [keyword, setKeyword] = useState('');

  // ── Data ──
  const [items, setItems] = useState<LedgerEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Expanded row ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Auto-refresh ──
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Record event form ──
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordEventType, setRecordEventType] = useState('terminal.command');
  const [recordSummary, setRecordSummary] = useState('');
  const [recordMemberId, setRecordMemberId] = useState('');
  const [recording, setRecording] = useState(false);

  // ── Time range calc ──
  const { since, until } = useMemo(() => {
    if (timePreset === 'all') {
      return { since: undefined as string | undefined, until: undefined as string | undefined };
    }
    const end = new Date();
    const start = new Date(end);
    switch (timePreset) {
      case '1h':
        start.setHours(start.getHours() - 1);
        break;
      case '24h':
        start.setHours(start.getHours() - 24);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
    }
    return { since: start.toISOString(), until: end.toISOString() };
  }, [timePreset]);

  // ── Load members + nodes for filters ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.getMembers();
        if (!cancelled) setMembersEnvelope({ members: res.members ?? [], teams: res.teams ?? [] });
      } catch {
        if (!cancelled) setMembersEnvelope({ members: [], teams: [] });
      }
    })();
    void getNodes()
      .then(({ nodes: n }) => { if (!cancelled) setNodes(n); })
      .catch(() => { if (!cancelled) setNodes([]); });
    return () => { cancelled = true; };
  }, [apiClient]);

  // ── Filter options ──
  const teamOptions = useMemo(() => {
    const { teams, members } = membersEnvelope;
    if (teams.length > 0) return teams.map((g) => ({ id: g.teamId, label: g.name ?? g.teamId }));
    const ids = new Set<string>();
    for (const m of members) { if (m.teamId) ids.add(m.teamId); }
    return [...ids].sort().map((id) => ({ id, label: id }));
  }, [membersEnvelope]);

  const memberOptions = useMemo(() => {
    const { teams, members } = membersEnvelope;
    if (teamId && teams.length > 0) {
      const g = teams.find((x) => x.teamId === teamId);
      return g?.members ?? [];
    }
    if (teamId) return members.filter((m) => m.teamId === teamId);
    return members;
  }, [membersEnvelope, teamId]);

  // ── Filtered items by keyword ──
  const filteredItems = useMemo(() => {
    if (!keyword.trim()) return items;
    const lc = keyword.toLowerCase();
    return items.filter(
      (row) =>
        row.summary.toLowerCase().includes(lc) ||
        row.eventType.toLowerCase().includes(lc) ||
        row.memberId.toLowerCase().includes(lc) ||
        row.correlationId.toLowerCase().includes(lc) ||
        JSON.stringify(row.context).toLowerCase().includes(lc)
    );
  }, [items, keyword]);

  // ── Load data ──
  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const res = await getLedgerEvents({
        workspaceId: workspace.workspaceId,
        teamId: teamId || undefined,
        memberId: memberId || undefined,
        nodeId: nodeId || undefined,
        eventType: eventType || undefined,
        since,
        until,
        limit: 500
      });
      setItems(res.items);
      setTotal(res.total);
      setLoadState('success');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      setLoadState('error');
    }
  }, [workspace.workspaceId, teamId, memberId, nodeId, eventType, since, until]);

  useEffect(() => { void load(); }, [load]);

  // ── Auto-refresh ──
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => { void load(); }, 10_000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, load]);

  // ── Record event ──
  const handleRecordEvent = useCallback(async () => {
    if (!recordSummary.trim() || !recordEventType) return;
    setRecording(true);
    try {
      await createLedgerEvent({
        workspaceId: workspace.workspaceId,
        memberId: recordMemberId || 'owner_1',
        eventType: recordEventType,
        summary: recordSummary.trim()
      });
      setRecordSummary('');
      void load();
    } catch {
      // error handled silently — the refresh will show or not show the event
    } finally {
      setRecording(false);
    }
  }, [workspace.workspaceId, recordMemberId, recordEventType, recordSummary, load]);

  // ── Reset filters ──
  const resetFilters = useCallback(() => {
    setTimePreset('7d');
    setTeamId('');
    setMemberId('');
    setNodeId('');
    setEventType('');
    setKeyword('');
  }, []);

  const activeFilterCount = [teamId, memberId, nodeId, eventType, keyword].filter(Boolean).length +
    (timePreset !== '7d' ? 1 : 0);

  return (
    <section className={`page-card ${styles['ledger-page']}`} data-route-page="ledger" data-page-entry="ledger-runtime">
      {/* Hero */}
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('ledger.eyebrow')}</p>
          <h1>{t('ledger.title')}</h1>
          <p className="route-page__intro">{t('ledger.intro')}</p>
        </div>
        <div className="route-page__metric-strip">
          <div className="route-page__metric">
            <span className="route-page__metric-label">{t('ledger.metricTotal')}</span>
            <strong>{total}</strong>
            <small>{t('ledger.metricTotalHint')}</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">{t('ledger.metricShown')}</span>
            <strong>{filteredItems.length}</strong>
            <small>{keyword ? t('ledger.metricFiltered') : t('ledger.metricLoaded')}</small>
          </div>
          <div className="route-page__metric">
            <span className="route-page__metric-label">{t('ledger.metricFilters')}</span>
            <strong>{activeFilterCount}</strong>
            <small>{t('ledger.metricActiveFilters')}</small>
          </div>
        </div>
      </div>

      <p className={styles['ledger-hint']}>{t('ledger.hintVsDashboard')}</p>

      {/* Filters bar */}
      <div className={styles['ledger-filters']} aria-label={t('ledger.filtersAria')}>
        <div className={styles['ledger-filters__field']}>
          <label htmlFor="ledger-preset">{t('ledger.timeRange')}</label>
          <select id="ledger-preset" value={timePreset} onChange={(ev) => setTimePreset(ev.target.value as TimePreset)}>
            <option value="1h">{t('ledger.preset1h')}</option>
            <option value="24h">{t('ledger.preset24h')}</option>
            <option value="7d">{t('ledger.preset7d')}</option>
            <option value="30d">{t('ledger.preset30d')}</option>
            <option value="all">{t('ledger.presetAll')}</option>
          </select>
        </div>
        <div className={styles['ledger-filters__field']}>
          <label htmlFor="ledger-team">{t('ledger.team')}</label>
          <select id="ledger-team" value={teamId} onChange={(ev) => { setTeamId(ev.target.value); setMemberId(''); }}>
            <option value="">{t('ledger.allTeams')}</option>
            {teamOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className={styles['ledger-filters__field']}>
          <label htmlFor="ledger-member">{t('ledger.member')}</label>
          <select id="ledger-member" value={memberId} onChange={(ev) => setMemberId(ev.target.value)}>
            <option value="">{t('ledger.allMembers')}</option>
            {memberOptions.map((m) => (
              <option key={m.memberId} value={m.memberId}>{m.displayName ?? m.memberId}</option>
            ))}
          </select>
        </div>
        <div className={styles['ledger-filters__field']}>
          <label htmlFor="ledger-node">{t('ledger.node')}</label>
          <select id="ledger-node" value={nodeId} onChange={(ev) => setNodeId(ev.target.value)}>
            <option value="">{t('ledger.allNodes')}</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.hostname || n.id}</option>
            ))}
          </select>
        </div>
        <div className={styles['ledger-filters__field']}>
          <label htmlFor="ledger-type">{t('ledger.eventType')}</label>
          <select id="ledger-type" value={eventType} onChange={(ev) => setEventType(ev.target.value)}>
            {EVENT_TYPE_PRESETS.map((v) => (
              <option key={v || 'any'} value={v}>{v || t('ledger.anyType')}</option>
            ))}
          </select>
        </div>
        <div className={styles['ledger-filters__field']}>
          <label htmlFor="ledger-search">{t('ledger.search')}</label>
          <input
            id="ledger-search"
            type="text"
            value={keyword}
            onChange={(ev) => setKeyword(ev.target.value)}
            placeholder={t('ledger.searchPlaceholder')}
          />
        </div>
        <div className={styles['ledger-filters__actions']}>
          <button type="button" onClick={() => void load()} disabled={loadState === 'loading'}>
            {loadState === 'loading' ? t('ledger.loading') : t('ledger.refresh')}
          </button>
          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters} className={styles['ledger-filters__reset']}>
              {t('ledger.resetFilters')}
            </button>
          )}
          <label className={styles['ledger-filters__auto']}>
            <input type="checkbox" checked={autoRefresh} onChange={(ev) => setAutoRefresh(ev.target.checked)} />
            {t('ledger.autoRefresh')}
          </label>
        </div>
      </div>

      {/* Record event toggle */}
      <div className={styles['ledger-record-toggle']}>
        <button type="button" onClick={() => setShowRecordForm(!showRecordForm)}>
          {showRecordForm ? t('ledger.hideRecordForm') : t('ledger.showRecordForm')}
        </button>
      </div>

      {/* Record event form */}
      {showRecordForm && (
        <div className={styles['ledger-record-form']}>
          <div className={styles['ledger-filters__field']}>
            <label htmlFor="record-type">{t('ledger.recordType')}</label>
            <select id="record-type" value={recordEventType} onChange={(ev) => setRecordEventType(ev.target.value)}>
              {EVENT_TYPE_PRESETS.filter(Boolean).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className={styles['ledger-filters__field']}>
            <label htmlFor="record-member">{t('ledger.recordMember')}</label>
            <select id="record-member" value={recordMemberId} onChange={(ev) => setRecordMemberId(ev.target.value)}>
              <option value="">{t('ledger.recordMemberDefault')}</option>
              {memberOptions.map((m) => (
                <option key={m.memberId} value={m.memberId}>{m.displayName ?? m.memberId}</option>
              ))}
            </select>
          </div>
          <div className={`${styles['ledger-filters__field']} ${styles['ledger-record-form__summary']}`}>
            <label htmlFor="record-summary">{t('ledger.recordSummary')}</label>
            <input
              id="record-summary"
              type="text"
              value={recordSummary}
              onChange={(ev) => setRecordSummary(ev.target.value)}
              placeholder={t('ledger.recordSummaryPlaceholder')}
              onKeyDown={(ev) => { if (ev.key === 'Enter') void handleRecordEvent(); }}
            />
          </div>
          <div className={styles['ledger-filters__actions']}>
            <button type="button" onClick={() => void handleRecordEvent()} disabled={recording || !recordSummary.trim()}>
              {recording ? t('ledger.recording') : t('ledger.record')}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {loadState === 'error' && (
        <div role="alert" className={styles['ledger-error']}>
          {t('ledger.loadError', { message: errorMessage ?? '' })}
        </div>
      )}

      {/* Loading */}
      {loadState === 'loading' && items.length === 0 && (
        <div role="status" className={styles['ledger-empty']}>{t('ledger.loading')}</div>
      )}

      {/* Empty */}
      {filteredItems.length === 0 && loadState === 'success' && (
        <div className={styles['ledger-empty']} role="status">
          {keyword ? t('ledger.noSearchResults') : t('ledger.empty')}
        </div>
      )}

      {/* Table */}
      {filteredItems.length > 0 && (
        <div className={styles['ledger-table-wrap']}>
          <table className={styles['ledger-table']}>
            <thead>
              <tr>
                <th className={styles['ledger-col--time']}>{t('ledger.colTime')}</th>
                <th>{t('ledger.colMember')}</th>
                <th>{t('ledger.colType')}</th>
                <th>{t('ledger.colSummary')}</th>
                <th>{t('ledger.colNode')}</th>
                <th className={styles['ledger-col--id']}>{t('ledger.colCorrelation')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((row) => {
                const isExpanded = expandedId === row.id;
                const hasContext = row.context && Object.keys(row.context).length > 0;
                return (
                  <tr
                    key={row.id}
                    className={isExpanded ? styles['ledger-row--expanded'] : undefined}
                    data-event-type={eventTypeTone(row.eventType)}
                  >
                    <td className={styles['ledger-col--time']}>
                      <time dateTime={row.timestamp} title={formatLocalTime(row.timestamp)}>
                        {relativeTime(row.timestamp)}
                      </time>
                      <span className={styles['ledger-time-abs']}>{formatLocalTime(row.timestamp)}</span>
                    </td>
                    <td>
                      <code>{row.memberId || '—'}</code>
                      {row.teamId && <span className={styles['ledger-team-tag']}>{row.teamId}</span>}
                    </td>
                    <td>
                      <span className={`${styles['ledger-type-pill']} ${styles[`ledger-type-pill--${eventTypeTone(row.eventType)}`] ?? ''}`}>
                        {row.eventType}
                      </span>
                    </td>
                    <td className={styles['ledger-col--summary']}>
                      <span>{row.summary}</span>
                      {(hasContext || row.sessionId || row.correlationId) && (
                        <button
                          type="button"
                          className={styles['ledger-expand-btn']}
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          aria-expanded={isExpanded}
                          aria-label={t('ledger.expandRow')}
                        >
                          {isExpanded ? '▾' : '▸'}
                        </button>
                      )}
                      {isExpanded && (
                        <div className={styles['ledger-detail']}>
                          {row.sessionId && (
                            <div className={styles['ledger-detail__kv']}>
                              <span className={styles['ledger-detail__label']}>{t('ledger.colSession')}</span>
                              <code>{row.sessionId}</code>
                            </div>
                          )}
                          {row.correlationId && (
                            <div className={styles['ledger-detail__kv']}>
                              <span className={styles['ledger-detail__label']}>{t('ledger.colCorrelation')}</span>
                              <code>{row.correlationId}</code>
                            </div>
                          )}
                          {row.nodeId && (
                            <div className={styles['ledger-detail__kv']}>
                              <span className={styles['ledger-detail__label']}>{t('ledger.colNode')}</span>
                              <code>{row.nodeId}</code>
                            </div>
                          )}
                          {hasContext && (
                            <div className={styles['ledger-detail__kv']}>
                              <span className={styles['ledger-detail__label']}>{t('ledger.colContext')}</span>
                              <pre className={styles['ledger-context']}>{formatContext(row.context)}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td><code>{row.nodeId || '—'}</code></td>
                    <td className={styles['ledger-col--id']}>
                      <code>{row.correlationId ? row.correlationId.slice(0, 8) : '—'}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer: auto-refresh indicator */}
      {autoRefresh && loadState === 'success' && (
        <p className={styles['ledger-auto-hint']}>{t('ledger.autoRefreshHint')}</p>
      )}
    </section>
  );
};
