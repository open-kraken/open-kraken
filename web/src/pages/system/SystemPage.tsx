import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail, translateRealtimeStatusLabel } from '@/i18n/realtime-copy';
import { useAppShell } from '@/state/app-shell-store';
import { listMemoryEntries, putMemoryEntry, deleteMemoryEntry, type MemoryScope, type MemoryEntry } from '@/api/memory';
import { getNodes } from '@/api/nodes';

type HealthPayload = {
  status?: string;
  service?: string;
  requestId?: string;
  warnings?: Array<{ name?: string; reason?: string }>;
  errors?: Array<{ name?: string; reason?: string }>;
};

type NodeSummary = { total: number; online: number; degraded: number; offline: number };

export const SystemPage = () => {
  const { t } = useI18n();
  const { notifications, realtime, workspace } = useAppShell();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthHttp, setHealthHttp] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Memory store state
  const [memoryScope, setMemoryScope] = useState<MemoryScope>('global');
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  // Node summary
  const [nodeSummary, setNodeSummary] = useState<NodeSummary | null>(null);

  const actorId = 'owner_1';

  const refresh = useCallback(async () => {
    setHealthError(null);
    try {
      const response = await fetch('/healthz', { method: 'GET', headers: { accept: 'application/json' } });
      setHealthHttp(response.status);
      if (!response.ok) {
        setHealth(null);
        setHealthError(`HTTP ${response.status}`);
        return;
      }
      setHealth((await response.json()) as HealthPayload);
    } catch (error: unknown) {
      setHealth(null);
      setHealthHttp(null);
      setHealthError(error instanceof Error ? error.message : 'health_probe_failed');
    }
  }, []);

  const loadMemory = useCallback(async () => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const res = await listMemoryEntries(memoryScope, actorId);
      setMemoryEntries(res.items);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to load memory');
      setMemoryEntries([]);
    } finally {
      setMemoryLoading(false);
    }
  }, [memoryScope]);

  const handlePutEntry = useCallback(async () => {
    if (!newKey.trim()) return;
    setSavingMemory(true);
    try {
      await putMemoryEntry(memoryScope, newKey.trim(), { value: newValue }, actorId);
      setNewKey('');
      setNewValue('');
      await loadMemory();
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSavingMemory(false);
    }
  }, [memoryScope, newKey, newValue, loadMemory]);

  const handleDeleteEntry = useCallback(async (key: string) => {
    try {
      await deleteMemoryEntry(memoryScope, key, actorId);
      await loadMemory();
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to delete entry');
    }
  }, [memoryScope, loadMemory]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void loadMemory(); }, [loadMemory]);

  // Load node summary
  useEffect(() => {
    void getNodes()
      .then(({ nodes }) => {
        setNodeSummary({
          total: nodes.length,
          online: nodes.filter((n) => n.status === 'online').length,
          degraded: nodes.filter((n) => n.status === 'degraded').length,
          offline: nodes.filter((n) => n.status === 'offline').length
        });
      })
      .catch(() => setNodeSummary(null));
  }, []);

  return (
    <section className="page-card system-route-page" data-route-page="system" data-page-entry="system-runtime">
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('system.eyebrow')}</p>
          <h1>{t('system.title')}</h1>
          <p className="route-page__intro">{t('system.intro')}</p>
        </div>
        <div className="route-page__metric-strip">
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('system.metric.workspace')}</span>
            <strong>{workspace.workspaceId}</strong>
            <small>{workspace.workspaceLabel}</small>
          </article>
          <article className="route-page__metric">
            <span className="route-page__metric-label">{t('system.metric.realtimeStream')}</span>
            <strong>{translateRealtimeStatusLabel(realtime.status, t)}</strong>
            <small>{translateRealtimeDetail(realtime.detail, t)}</small>
          </article>
          {nodeSummary && (
            <article className="route-page__metric">
              <span className="route-page__metric-label">{t('system.metric.nodes')}</span>
              <strong>{nodeSummary.total}</strong>
              <small>{t('system.metric.nodesDetail', {
                online: nodeSummary.online,
                degraded: nodeSummary.degraded,
                offline: nodeSummary.offline
              })}</small>
            </article>
          )}
        </div>
      </div>

      <div className="route-page__grid route-page__grid--system">
        {/* Backend health */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('system.runtimeEyebrow')}</p>
              <h2>{t('system.backendHealth')}</h2>
            </div>
            <button type="button" className="route-page__panel-refresh" onClick={() => void refresh()}>
              {t('system.refresh')}
            </button>
          </header>
          {healthError ? (
            <p className="system-route-page__error">{healthError}</p>
          ) : (
            <dl className="system-route-page__kv">
              <div>
                <dt>{t('system.http')}</dt>
                <dd>{healthHttp ?? t('system.emDash')}</dd>
              </div>
              <div>
                <dt>{t('system.statusField')}</dt>
                <dd>{health?.status ?? t('system.emDash')}</dd>
              </div>
              <div>
                <dt>{t('system.serviceField')}</dt>
                <dd>{health?.service ?? t('system.emDash')}</dd>
              </div>
              <div>
                <dt>{t('system.requestIdField')}</dt>
                <dd className="system-route-page__mono">{health?.requestId ?? t('system.emDash')}</dd>
              </div>
            </dl>
          )}
          {/* Health warnings */}
          {health?.warnings && health.warnings.length > 0 && (
            <div className="system-route-page__warnings">
              <h3>{t('system.warnings')}</h3>
              <ul>
                {health.warnings.map((w, i) => (
                  <li key={i} className="system-route-page__warning-item">
                    <strong>{w.name ?? 'warning'}</strong>: {w.reason ?? t('system.emDash')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Health errors */}
          {health?.errors && health.errors.length > 0 && (
            <div className="system-route-page__errors">
              <h3>{t('system.errors')}</h3>
              <ul>
                {health.errors.map((e, i) => (
                  <li key={i} className="system-route-page__error-item">
                    <strong>{e.name ?? 'error'}</strong>: {e.reason ?? t('system.emDash')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="route-page__intro">{t('system.healthIntro')}</p>
        </section>

        {/* Shell notices */}
        <section className="route-page__panel">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('system.clientEyebrow')}</p>
              <h2>{t('system.shellNoticesTitle')}</h2>
            </div>
          </header>
          <p>{t('system.shellNoticesBody', { count: notifications.length })}</p>
          {notifications.length > 0 && (
            <ul className="system-route-page__notice-list">
              {notifications.map((n) => (
                <li key={n.id} className={`system-route-page__notice-item system-route-page__notice-item--${n.tone}`}>
                  <strong>{n.title}</strong>
                  <span>{n.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Memory store browser */}
        <section className="route-page__panel system-route-page__panel--span">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('system.memoryEyebrow')}</p>
              <h2>{t('system.memoryTitle')}</h2>
            </div>
            <div className="system-route-page__memory-controls">
              <select
                value={memoryScope}
                onChange={(e) => setMemoryScope(e.target.value as MemoryScope)}
                aria-label={t('system.memoryScopeLabel')}
              >
                <option value="global">global</option>
                <option value="team">team</option>
                <option value="agent">agent</option>
              </select>
              <button
                type="button"
                className="route-page__panel-refresh"
                onClick={() => void loadMemory()}
                disabled={memoryLoading}
              >
                {t('system.refresh')}
              </button>
            </div>
          </header>

          {memoryError && <p className="system-route-page__error">{memoryError}</p>}

          {memoryLoading ? (
            <p>{t('system.memoryLoading')}</p>
          ) : memoryEntries.length === 0 ? (
            <p className="system-route-page__empty">{t('system.memoryEmpty')}</p>
          ) : (
            <table className="system-route-page__memory-table">
              <thead>
                <tr>
                  <th>{t('system.memoryColKey')}</th>
                  <th>{t('system.memoryColValue')}</th>
                  <th>{t('system.memoryColOwner')}</th>
                  <th>{t('system.memoryColUpdated')}</th>
                  <th>{t('system.memoryColActions')}</th>
                </tr>
              </thead>
              <tbody>
                {memoryEntries.map((entry) => (
                  <tr key={entry.key}>
                    <td className="system-route-page__mono">{entry.key}</td>
                    <td>{entry.value.length > 120 ? `${entry.value.slice(0, 120)}…` : entry.value}</td>
                    <td>{entry.ownerId || t('system.emDash')}</td>
                    <td>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : t('system.emDash')}</td>
                    <td>
                      <button
                        type="button"
                        className="system-route-page__delete-btn"
                        onClick={() => void handleDeleteEntry(entry.key)}
                      >
                        {t('system.memoryDelete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add new entry form */}
          <div className="system-route-page__memory-form">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={t('system.memoryKeyPlaceholder')}
              aria-label={t('system.memoryKeyLabel')}
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={t('system.memoryValuePlaceholder')}
              aria-label={t('system.memoryValueLabel')}
              onKeyDown={(e) => { if (e.key === 'Enter') void handlePutEntry(); }}
            />
            <button
              type="button"
              onClick={() => void handlePutEntry()}
              disabled={savingMemory || !newKey.trim()}
            >
              {savingMemory ? t('system.memorySaving') : t('system.memorySave')}
            </button>
          </div>
        </section>

        {/* Contracts */}
        <section className="route-page__panel system-route-page__panel--span">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('system.contractsEyebrow')}</p>
              <h2>{t('system.contractsTitle')}</h2>
            </div>
          </header>
          <ul className="system-route-page__checklist">
            <li>{t('system.contract1')}</li>
            <li>{t('system.contract2')}</li>
            <li>{t('system.contract3')}</li>
          </ul>
        </section>
      </div>
    </section>
  );
};
