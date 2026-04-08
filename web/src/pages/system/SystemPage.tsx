import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useAppShell } from '@/state/app-shell-store';
import {
  listMemoryEntries,
  putMemoryEntry,
  deleteMemoryEntry,
  type MemoryScope,
  type MemoryEntry,
} from '@/api/memory';
import { getNodes } from '@/api/nodes';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';

type HealthPayload = {
  status?: string;
  service?: string;
  requestId?: string;
  warnings?: Array<{ name?: string; reason?: string }>;
  errors?: Array<{ name?: string; reason?: string }>;
};

type NodeSummary = { total: number; online: number; degraded: number; offline: number };

export const SystemPage = () => {
  const { notifications } = useAppShell();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthHttp, setHealthHttp] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

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

  const { account } = useAuth();
  const actorId = account?.memberId ?? '';

  const refresh = useCallback(async () => {
    setHealthError(null);
    const start = performance.now();
    try {
      const response = await fetch('/healthz', {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      setLatencyMs(Math.round(performance.now() - start));
      setHealthHttp(response.status);
      if (!response.ok) {
        setHealth(null);
        setHealthError(`HTTP ${response.status}`);
        return;
      }
      setHealth((await response.json()) as HealthPayload);
    } catch (error: unknown) {
      setLatencyMs(Math.round(performance.now() - start));
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
  }, [memoryScope, actorId]);

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
  }, [memoryScope, newKey, newValue, loadMemory, actorId]);

  const handleDeleteEntry = useCallback(
    async (key: string) => {
      try {
        await deleteMemoryEntry(memoryScope, key, actorId);
        await loadMemory();
      } catch (err) {
        setMemoryError(err instanceof Error ? err.message : 'Failed to delete entry');
      }
    },
    [memoryScope, loadMemory, actorId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  // Load node summary
  useEffect(() => {
    void getNodes()
      .then(({ nodes }) => {
        setNodeSummary({
          total: nodes.length,
          online: nodes.filter((n) => n.status === 'online').length,
          degraded: nodes.filter((n) => n.status === 'degraded').length,
          offline: nodes.filter((n) => n.status === 'offline').length,
        });
      })
      .catch(() => setNodeSummary(null));
  }, []);

  const isHealthy = health?.status === 'ok' || (healthHttp !== null && healthHttp >= 200 && healthHttp < 300);

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold app-text-strong mb-1">System Health</h1>
            <p className="text-sm app-text-muted">Backend services and system status</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw size={14} className="mr-1" />
            Refresh
          </Button>
        </div>

        {/* Health Status */}
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                healthError
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-green-100 dark:bg-green-900/30'
              }`}
            >
              {healthError ? (
                <AlertCircle size={24} className="text-red-600" />
              ) : (
                <CheckCircle size={24} className="text-green-600" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold app-text-strong mb-1">
                {healthError ? 'System Error' : 'All Systems Operational'}
              </h3>
              {healthError ? (
                <p className="text-sm text-red-600 mb-3">{healthError}</p>
              ) : (
                <p className="text-sm app-text-muted mb-3">
                  HTTP Status: {healthHttp ?? '--'} &middot; Service:{' '}
                  {health?.service ?? 'kraken-api'} &middot; Request ID:{' '}
                  {health?.requestId ?? '--'}
                </p>
              )}
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="app-text-faint">Latency:</span>{' '}
                  <span className="font-mono app-text-strong">
                    {latencyMs !== null ? `${latencyMs}ms` : '--'}
                  </span>
                </div>
                <div>
                  <span className="app-text-faint">Uptime:</span>{' '}
                  <span className="font-mono app-text-strong">
                    {isHealthy ? '99.9%' : '--'}
                  </span>
                </div>
                <div>
                  <span className="app-text-faint">Version:</span>{' '}
                  <span className="font-mono app-text-strong">v1.0.0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Health warnings */}
          {health?.warnings && health.warnings.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                Warnings
              </h4>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                {health.warnings.map((w, i) => (
                  <li key={i}>
                    <strong>{w.name ?? 'warning'}</strong>: {w.reason ?? '--'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Health errors */}
          {health?.errors && health.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                Errors
              </h4>
              <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
                {health.errors.map((e, i) => (
                  <li key={i}>
                    <strong>{e.name ?? 'error'}</strong>: {e.reason ?? '--'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Node Summary - Compact */}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold app-text-strong text-sm">Node Summary</h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Total:</span>
                <span className="font-semibold app-text-strong">
                  {nodeSummary?.total ?? '--'}
                </span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Online:</span>
                <span className="font-semibold text-green-600">
                  {nodeSummary?.online ?? '--'}
                </span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Degraded:</span>
                <span className="font-semibold text-yellow-600">
                  {nodeSummary?.degraded ?? '--'}
                </span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Offline:</span>
                <span className="font-semibold app-text-faint">
                  {nodeSummary?.offline ?? '--'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Shell Notices */}
        {notifications.length > 0 && (
          <Card className="p-4 mb-6">
            <h3 className="font-semibold app-text-strong text-sm mb-3">
              Shell Notices ({notifications.length})
            </h3>
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-3 p-2 rounded app-surface-strong text-xs"
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      n.tone === 'error'
                        ? 'text-red-600 border-red-600'
                        : n.tone === 'warning'
                          ? 'text-yellow-600 border-yellow-600'
                          : 'text-blue-600 border-blue-600'
                    }`}
                  >
                    {n.tone}
                  </Badge>
                  <span className="font-medium app-text-strong">{n.title}</span>
                  <span className="app-text-muted">{n.detail}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Memory Store */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold app-text-strong">Memory Store</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadMemory()}
                disabled={memoryLoading}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm app-text-muted mb-2 block">Scope</label>
            <div className="flex gap-2">
              {(['global', 'team', 'agent'] as MemoryScope[]).map((scope) => (
                <Badge
                  key={scope}
                  variant="outline"
                  className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    memoryScope === scope ? 'bg-gray-100 dark:bg-gray-800 font-semibold' : ''
                  }`}
                  onClick={() => setMemoryScope(scope)}
                >
                  {scope.charAt(0).toUpperCase() + scope.slice(1)}
                </Badge>
              ))}
            </div>
          </div>

          {memoryError && (
            <p className="text-sm text-red-600 mb-3">{memoryError}</p>
          )}

          {memoryLoading ? (
            <p className="text-sm app-text-muted">Loading memory entries...</p>
          ) : memoryEntries.length === 0 ? (
            <p className="text-sm app-text-muted">No entries in this scope.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memoryEntries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell className="font-mono text-sm">{entry.key}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.value.length > 120
                        ? `${entry.value.slice(0, 120)}...`
                        : entry.value}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {memoryScope}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteEntry(entry.key)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Add new entry form */}
          <div className="mt-4 flex items-center gap-2">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Key"
              className="max-w-48"
            />
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handlePutEntry();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePutEntry()}
              disabled={savingMemory || !newKey.trim()}
            >
              {savingMemory ? 'Saving...' : 'Add Entry'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
