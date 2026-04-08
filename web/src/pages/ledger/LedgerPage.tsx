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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppShell } from '@/state/app-shell-store';
import { useAuth } from '@/auth/AuthProvider';
import { getLedgerEvents, createLedgerEvent } from '@/api/ledger';
import { getNodes } from '@/api/nodes';
import type { LedgerEvent } from '@/types/ledger';
import type { MemberFixture, TeamGroupFixture } from '@/features/members/member-page-model';
import type { Node } from '@/types/node';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { StatusDot } from '@/components/ui/status-dot';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  FileText,
  Download,
  Clock,
  User,
  Terminal,
  Cpu,
  Package,
  GitBranch,
  Database,
  Zap,
  Filter,
} from 'lucide-react';

type TimePreset = '1h' | '24h' | '7d' | '30d' | 'all';

const EVENT_TYPE_PRESETS = [
  '',
  'terminal.command',
  'llm.call',
  'tool.run',
  'deploy',
  'git.operation',
  'memory.write',
  'skill.assign',
] as const;

function formatLocalTime(iso: string): string {
  if (!iso) return '\u2014';
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

/* ── Event type badge with icon ── */

function getEventBadge(type: string) {
  const eventTypes: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
    terminal: {
      icon: <Terminal size={12} />,
      className: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300',
      label: 'Terminal',
    },
    llm: {
      icon: <Zap size={12} />,
      className: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300',
      label: 'LLM',
    },
    tool: {
      icon: <Package size={12} />,
      className: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300',
      label: 'Tool',
    },
    deploy: {
      icon: <Cpu size={12} />,
      className: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300',
      label: 'Deploy',
    },
    git: {
      icon: <GitBranch size={12} />,
      className: 'bg-pink-50 text-pink-700 border-pink-300 dark:bg-pink-950 dark:text-pink-300',
      label: 'Git',
    },
    memory: {
      icon: <Database size={12} />,
      className: 'bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300',
      label: 'Memory',
    },
    skill: {
      icon: <FileText size={12} />,
      className: 'bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950 dark:text-teal-300',
      label: 'Skill',
    },
  };

  // Match type prefix (e.g., "terminal.command" -> "terminal")
  const prefix = type.split('.')[0];
  const config = eventTypes[prefix] || eventTypes.terminal;

  return (
    <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
      {config.icon}
      <span>{config.label}</span>
    </Badge>
  );
}

/* ── Main Page ── */

export const LedgerPage = () => {
  const { apiClient, workspace, navigate } = useAppShell();
  const { account } = useAuth();

  // ── Roster (teams + members) for filter dropdowns ──
  const [membersEnvelope, setMembersEnvelope] = useState<{
    members: MemberFixture[];
    teams: TeamGroupFixture[];
  }>({ members: [], teams: [] });

  // ── Nodes for filter dropdown ──
  const [nodes, setNodes] = useState<Node[]>([]);

  // ── Filters ──
  const [timePreset, setTimePreset] = useState<TimePreset>('24h');
  const [teamId, setTeamId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [eventType, setEventType] = useState('');
  const [keyword, setKeyword] = useState('');

  // ── Data ──
  const [items, setItems] = useState<LedgerEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');

  // ── Expanded row ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Auto-refresh ──
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const uniqueMembers = useMemo(
    () => new Set(items.map((e) => e.memberId)).size,
    [items]
  );

  // ── Load data ──
  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await getLedgerEvents({
        workspaceId: workspace.workspaceId,
        teamId: teamId || undefined,
        memberId: memberId || undefined,
        nodeId: nodeId || undefined,
        eventType: eventType || undefined,
        since,
        until,
        limit: 500,
      });
      setItems(res.items);
      setTotal(res.total);
      setLoadState('success');
    } catch {
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

  // ── Reset filters ──
  const resetFilters = useCallback(() => {
    setTimePreset('24h');
    setTeamId('');
    setMemberId('');
    setNodeId('');
    setEventType('');
    setKeyword('');
  }, []);

  const activeFilterCount =
    [teamId, memberId, nodeId, eventType, keyword].filter(Boolean).length +
    (timePreset !== '24h' ? 1 : 0);

  // ── Get member display info ──
  const getMemberInfo = useCallback(
    (mid: string) => membersEnvelope.members.find((m) => m.memberId === mid),
    [membersEnvelope.members]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold app-text-strong">Audit Ledger</h1>
            </div>
            {/* Inline Metrics */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <FileText size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{total}</span>
                <span className="app-text-faint">events</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Shown:</span>
                <span className="font-semibold app-text-strong">{filteredItems.length}</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <User size={14} className="app-accent-text" />
                <span className="font-semibold app-text-strong">{uniqueMembers}</span>
                <span className="app-text-faint">members</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" className="text-xs app-text-muted cursor-pointer">
                Auto-refresh
              </Label>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={() => void load()}>
              <RefreshCw size={14} className="mr-1" />
              Refresh
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" className="h-8" onClick={resetFilters}>
                <Filter size={14} className="mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="app-bg-canvas px-6 py-3 border-b app-border-subtle">
        <div className="grid grid-cols-5 gap-3 mb-3">
          <Select value={timePreset} onValueChange={(v) => setTimePreset(v as TimePreset)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={teamId || 'all-teams'} onValueChange={(v) => { setTeamId(v === 'all-teams' ? '' : v); setMemberId(''); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-teams">All Teams</SelectItem>
              {teamOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={memberId || 'all-members'} onValueChange={(v) => setMemberId(v === 'all-members' ? '' : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-members">All Members</SelectItem>
              {memberOptions.map((m) => (
                <SelectItem key={m.memberId} value={m.memberId}>
                  {m.displayName ?? m.memberId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={eventType || 'all-types'} onValueChange={(v) => setEventType(v === 'all-types' ? '' : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-types">All Types</SelectItem>
              <SelectItem value="terminal.command">Terminal</SelectItem>
              <SelectItem value="llm.call">LLM</SelectItem>
              <SelectItem value="tool.run">Tool</SelectItem>
              <SelectItem value="deploy">Deploy</SelectItem>
              <SelectItem value="git.operation">Git</SelectItem>
              <SelectItem value="memory.write">Memory</SelectItem>
              <SelectItem value="skill.assign">Skill</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint" />
            <Input
              placeholder="Search events..."
              className="pl-9"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs app-text-faint">
            Showing {filteredItems.length} events · Filters: {activeFilterCount} active
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loadState === 'loading' && items.length === 0 && (
          <div className="text-center py-12 app-text-muted">
            <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-50" />
            <p className="text-sm">Loading audit events...</p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="text-center py-12">
            <p className="text-sm text-red-500">Failed to load ledger events.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}

        {filteredItems.length === 0 && loadState === 'success' && (
          <div className="text-center py-12 app-text-muted">
            <FileText size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">{keyword ? 'No events match your search' : 'No audit events found'}</p>
          </div>
        )}

        {filteredItems.length > 0 && (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableHead className="w-10" />
                  <TableHead className="w-[140px]">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      <span>Time</span>
                    </div>
                  </TableHead>
                  <TableHead className="w-[200px]">
                    <div className="flex items-center gap-2">
                      <User size={14} />
                      <span>Executor</span>
                    </div>
                  </TableHead>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      <FileText size={14} />
                      <span>Action / Command</span>
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px] text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((event) => {
                  const isExpanded = expandedId === event.id;
                  const member = getMemberInfo(event.memberId);
                  const hasContext = event.context && Object.keys(event.context).length > 0;

                  return (
                    <React.Fragment key={event.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      >
                        <TableCell>
                          <button className="app-text-muted hover:app-text-strong">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </TableCell>

                        <TableCell className="font-mono text-xs app-text-faint">
                          <span title={formatLocalTime(event.timestamp)}>
                            {relativeTime(event.timestamp)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                              {(member?.displayName ?? event.memberId).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium app-text-strong truncate">
                                {member?.displayName ?? event.memberId}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <StatusDot status={member?.status === 'running' ? 'working' : member?.status === 'idle' ? 'online' : 'offline'} />
                                <span className="text-xs app-text-faint capitalize">
                                  {member?.roleType ?? 'unknown'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>{getEventBadge(event.eventType)}</TableCell>

                        <TableCell>
                          <div className="font-mono text-sm app-text-strong">{event.summary}</div>
                          {event.sessionId && (
                            <div className="text-xs app-text-faint font-mono mt-0.5">
                              Session: {event.sessionId}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className="text-green-600 border-green-600 text-xs"
                          >
                            Success
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-gray-50 dark:bg-gray-900/50 p-0">
                            <div className="p-6 space-y-4">
                              {/* Execution Details */}
                              <div className="grid grid-cols-2 gap-4">
                                <Card className="p-4">
                                  <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                                    Execution Context
                                  </div>
                                  <div className="space-y-2">
                                    {event.sessionId && (
                                      <div className="flex items-start gap-2">
                                        <Terminal size={14} className="app-text-muted mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs app-text-faint">Session ID</div>
                                          <div className="font-mono text-sm app-text-strong truncate">
                                            {event.sessionId}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {event.correlationId && (
                                      <div className="flex items-start gap-2">
                                        <GitBranch size={14} className="app-text-muted mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs app-text-faint">Correlation ID</div>
                                          <div className="font-mono text-sm app-text-strong truncate">
                                            {event.correlationId}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex items-start gap-2">
                                      <User size={14} className="app-text-muted mt-0.5" />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs app-text-faint">Executor</div>
                                        <div className="text-sm app-text-strong">
                                          {member?.displayName ?? event.memberId}
                                        </div>
                                        <div className="text-xs app-text-faint">
                                          {member?.roleType ?? 'unknown'} · {member?.status ?? 'unknown'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <Clock size={14} className="app-text-muted mt-0.5" />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs app-text-faint">Timestamp</div>
                                        <div className="font-mono text-sm app-text-strong">
                                          {formatLocalTime(event.timestamp)}
                                        </div>
                                      </div>
                                    </div>
                                    {event.nodeId && (
                                      <div className="flex items-start gap-2">
                                        <Cpu size={14} className="app-text-muted mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs app-text-faint">Node</div>
                                          <div className="font-mono text-sm app-text-strong">
                                            {event.nodeId}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </Card>

                                {hasContext && (
                                  <Card className="p-4">
                                    <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                                      Additional Context
                                    </div>
                                    <pre className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto max-h-[200px] app-text-strong">
                                      {formatContext(event.context)}
                                    </pre>
                                  </Card>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-2 pt-2 border-t app-border-subtle">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (event.sessionId) navigate('terminal', { hash: event.sessionId });
                                  }}
                                >
                                  <Terminal size={14} className="mr-1" />
                                  View Session
                                </Button>
                                <Button variant="outline" size="sm">
                                  <GitBranch size={14} className="mr-1" />
                                  Related Events
                                </Button>
                                <Button variant="outline" size="sm">
                                  <Download size={14} className="mr-1" />
                                  Export
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
};
