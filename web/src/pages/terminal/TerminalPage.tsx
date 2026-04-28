import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { TerminalPanel } from '@/features/terminal/TerminalPanel';
import { normalizeMembersEnvelope, type MemberFixture } from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { useAuth } from '@/auth/AuthProvider';
import {
  sendTerminalInput,
  closeTerminalSession,
  resolveOrCreateMemberSession,
  listTerminalSessions,
  mapTerminalSession,
  type TerminalSessionInfo,
} from '@/api/terminal';
import { useTerminalPanelRuntime } from './terminal-runtime';
import { StatusDot } from '@/components/ui/status-dot';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Terminal as TerminalIcon,
  Circle,
  Radio,
  X,
  Play,
  Pause,
  Plus,
  RefreshCw,
  Users,
  Monitor,
  AlertTriangle,
  Activity,
  Server,
  Square,
} from 'lucide-react';

const fallbackTerminalIdForMember = (memberId: string) => `term_${memberId}`;
const terminalIdForMember = (member: Pick<MemberFixture, 'memberId' | 'terminalId'>) =>
  member.terminalId?.trim() || fallbackTerminalIdForMember(member.memberId);
const acceptsTerminalHash = (raw: string) => raw.startsWith('term_') || raw.startsWith('session-');
const statusIsLive = (status: string) => ['online', 'working', 'running', 'attached'].includes(status.toLowerCase());
const statusIsWorking = (status: string) => ['working', 'running'].includes(status.toLowerCase());
const statusIsAbnormal = (status: string) => ['error', 'failed', 'exited'].includes(status.toLowerCase());
const statusDotValue = (status: string): 'online' | 'working' | 'offline' => {
  const normalized = status.toLowerCase();
  if (normalized === 'online' || normalized === 'attached') return 'online';
  if (normalized === 'working' || normalized === 'running') return 'working';
  return 'offline';
};

const metadataText = (metadata: Record<string, unknown>, keys: string[], fallback = '') => {
  for (const key of keys) {
    const value = metadata[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }
  return fallback;
};

const formatRelativeTime = (value: string) => {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const deltaMs = Date.now() - date.getTime();
  const deltaMinutes = Math.max(0, Math.round(deltaMs / 60_000));
  if (deltaMinutes < 1) return 'just now';
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return date.toLocaleDateString();
};

type SessionRow = {
  key: string;
  member: MemberFixture | null;
  session: TerminalSessionInfo | null;
  terminalId: string;
  status: string;
  command: string;
  node: string;
  restartSummary: string;
};

export const TerminalPage = () => {
  const { t } = useI18n();
  const { realtime, workspace, apiClient, realtimeClient, pushNotification } = useAppShell();
  const { account } = useAuth();
  const defaultTerminalId = fallbackTerminalIdForMember(account?.memberId ?? 'owner_1');

  const bootTerminalId = useMemo(() => {
    if (typeof window === 'undefined') {
      return defaultTerminalId;
    }
    const raw = window.location.hash.replace(/^#/, '').trim();
    return acceptsTerminalHash(raw) ? raw : defaultTerminalId;
  }, []);

  const terminalRuntime = useTerminalPanelRuntime({
    apiClient,
    realtimeClient,
    pushNotification,
    initialTerminalId: bootTerminalId
  });

  const [roster, setRoster] = useState<MemberFixture[]>([]);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [newSessionModalOpen, setNewSessionModalOpen] = useState(false);
  const [newSessionData, setNewSessionData] = useState({
    member: '',
    provider: 'claude-code',
    workingDir: '~/workspace',
  });

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

  const refreshSessions = useCallback(async () => {
    setRefreshingSessions(true);
    setSessionsError(null);
    try {
      const clientListSessions =
        apiClient && typeof apiClient === 'object' && 'listTerminalSessions' in apiClient
          ? (apiClient as { listTerminalSessions?: (workspaceId: string) => Promise<{ items: Array<Record<string, unknown>> }> }).listTerminalSessions
          : undefined;
      const response = clientListSessions
        ? await clientListSessions(workspace.workspaceId)
        : await listTerminalSessions(workspace.workspaceId);
      setSessions((response.items ?? []).map((item) => mapTerminalSession(item)));
    } catch (err) {
      setSessions([]);
      setSessionsError(err instanceof Error ? err.message : 'Unable to load terminal sessions');
    } finally {
      setRefreshingSessions(false);
    }
  }, [apiClient, workspace.workspaceId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

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
      if (acceptsTerminalHash(raw)) {
        void terminalRuntime.attachTo(raw);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [terminalRuntime]);

  const activeTerminalId =
    terminalRuntime.state.activeTerminalId ?? terminalRuntime.state.session?.terminalId ?? bootTerminalId;

  const sessionRows = useMemo<SessionRow[]>(() => {
    const memberById = new Map(roster.map((member) => [member.memberId, member]));
    const rows = sessions.map((session) => {
      const member = memberById.get(session.memberId) ?? null;
      const node = metadataText(session.metadata, ['currentNode', 'nodeId', 'nodeName', 'podName'], 'unassigned');
      const previousNode = metadataText(session.metadata, ['previousNode', 'lastNode', 'failedNode']);
      const restartCount = Number(session.metadata.restartCount ?? session.metadata.restarts ?? 0);
      const restartedAt = metadataText(session.metadata, ['restartedAt', 'lastRestartAt', 'failoverAt']);
      const restartSummary = previousNode
        ? `restarted from ${previousNode}${restartedAt ? ` ${formatRelativeTime(restartedAt)}` : ''}`
        : restartCount > 0
          ? `${restartCount} restart${restartCount === 1 ? '' : 's'} recorded`
          : 'no restart recorded';
      return {
        key: `session:${session.terminalId}`,
        member,
        session,
        terminalId: session.terminalId,
        status: session.status,
        command: session.command || session.terminalType || 'shell',
        node,
        restartSummary,
      };
    });

    const sessionMemberIds = new Set(sessions.map((session) => session.memberId).filter(Boolean));
    const emptyMemberRows = roster
      .filter((member) => !sessionMemberIds.has(member.memberId))
      .map((member) => ({
        key: `member:${member.memberId}`,
        member,
        session: null,
        terminalId: terminalIdForMember(member),
        status: member.terminalStatus ?? member.manualStatus ?? member.status ?? 'offline',
        command: 'No shell session',
        node: 'unassigned',
        restartSummary: 'no shell launched',
      }));

    return [...rows, ...emptyMemberRows];
  }, [roster, sessions]);

  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((session) => statusIsLive(session.status)).length;
  const workingSessions = sessions.filter((session) => statusIsWorking(session.status)).length;
  const abnormalSessions = sessions.filter((session) => statusIsAbnormal(session.status)).length;

  const activeMember = useMemo(() => {
    const sessionMemberId = terminalRuntime.state.session?.memberId;
    if (sessionMemberId) {
      return roster.find((m) => m.memberId === sessionMemberId);
    }
    const activeSession = sessions.find((session) => session.terminalId === activeTerminalId);
    if (activeSession?.memberId) {
      return roster.find((m) => m.memberId === activeSession.memberId);
    }
    return roster.find((m) => terminalIdForMember(m) === activeTerminalId);
  }, [roster, sessions, terminalRuntime.state.session?.memberId, activeTerminalId]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.terminalId === terminalRuntime.state.session?.terminalId || session.terminalId === activeTerminalId) ?? null,
    [sessions, terminalRuntime.state.session?.terminalId, activeTerminalId]
  );

  /** Send text input to the active terminal session. */
  const handleSendInput = useCallback((data: string) => {
    const sessionId = terminalRuntime.state.session?.terminalId;
    if (!sessionId) return;
    void sendTerminalInput(sessionId, data).catch((err) => {
      pushNotification({
        tone: 'error',
        title: t('terminal.inputError'),
        detail: err instanceof Error ? err.message : 'Input send failed'
      });
    });
  }, [terminalRuntime.state.session?.terminalId, pushNotification, t]);

  /** Close the active terminal session. */
  const handleCloseSession = useCallback(async (sessionId = terminalRuntime.state.session?.terminalId) => {
    if (!sessionId) return;
    setClosingSession(true);
    setClosingSessionId(sessionId);
    try {
      await closeTerminalSession(sessionId);
      await refreshSessions();
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
      setClosingSessionId(null);
    }
  }, [terminalRuntime.state.session?.terminalId, refreshSessions, pushNotification, t]);

  const handleToggleFollow = useCallback(() => {
    setFollowing((f) => !f);
    terminalRuntime.toggleFollow();
  }, [terminalRuntime]);

  const handleCreateSession = useCallback(async () => {
    if (!newSessionData.member) return;
    try {
      // Map frontend provider id → backend terminalType key.
      const providerToTerminalType: Record<string, string> = {
        'claude-code': 'claude',
        'gemini-cli': 'gemini',
        'codex-cli': 'codex',
        'qwen-code': 'qwen',
        'shell': 'shell',
      };
      const terminalType = providerToTerminalType[newSessionData.provider] ?? 'shell';
      const sessionId = await resolveOrCreateMemberSession(
        workspace.workspaceId,
        newSessionData.member,
        { terminalType, cwd: newSessionData.workingDir }
      );
      setNewSessionModalOpen(false);
      setNewSessionData({ member: '', provider: 'claude-code', workingDir: '~/workspace' });
      await refreshSessions();
      // Attach to the new session
      setHashForTerminal(sessionId);
      void terminalRuntime.attachTo(sessionId);
      pushNotification({
        tone: 'info',
        title: t('terminal.sessionCreated'),
        detail: `Session ${sessionId} created and attached.`
      });
    } catch (err) {
      pushNotification({
        tone: 'error',
        title: 'Failed to create session',
        detail: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }, [newSessionData, workspace.workspaceId, refreshSessions, pushNotification, t, setHashForTerminal, terminalRuntime]);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <Circle size={8} className="mr-1 fill-current" />
            Online
          </Badge>
        );
      case 'working':
      case 'running':
      case 'attached':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <Radio size={8} className="mr-1 animate-pulse" />
            Working
          </Badge>
        );
      case 'offline':
      case 'exited':
        return (
          <Badge variant="outline" className="text-gray-500 border-gray-500">
            <Circle size={8} className="mr-1" />
            Offline
          </Badge>
        );
      case 'error':
      case 'failed':
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <AlertTriangle size={8} className="mr-1" />
            Failed
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col" data-route-page="terminal">
      {/* Compact Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold app-text-strong">Terminal Sessions</h1>
            </div>
            {/* Inline Metrics */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Monitor size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{totalSessions}</span>
                <span className="app-text-faint">sessions</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Circle size={14} className="text-green-600 fill-current" />
                <span className="font-semibold text-green-600">{activeSessions}</span>
                <span className="app-text-faint">active</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Radio size={14} className="text-yellow-600" />
                <span className="font-semibold text-yellow-600">{workingSessions}</span>
                <span className="app-text-faint">working</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Users size={14} className="app-accent-text" />
                <span className="font-semibold app-text-strong">{roster.length}</span>
                <span className="app-text-faint">members</span>
              </div>
              {abnormalSessions > 0 && (
                <>
                  <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-red-600" />
                    <span className="font-semibold text-red-600">{abnormalSessions}</span>
                    <span className="app-text-faint">needs attention</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={() => void refreshSessions()} disabled={refreshingSessions}>
              <RefreshCw size={14} className={`mr-1 ${refreshingSessions ? 'animate-spin' : ''}`} />
              {refreshingSessions ? 'Refreshing' : 'Refresh'}
            </Button>
            <Button size="sm" onClick={() => setNewSessionModalOpen(true)} className="h-8">
              <Plus size={14} className="mr-1" />
              New Session
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-[260px] app-surface-strong border-r app-border-subtle flex flex-col">
          <div className="p-4 border-b app-border-subtle">
            <h2 className="font-semibold text-sm app-text-strong">All Team Sessions</h2>
            <p className="text-xs app-text-faint mt-0.5">
              {activeSessions} active · {totalSessions} shell sessions
            </p>
            {sessionsError && (
              <p className="mt-2 text-[11px] text-red-600">{sessionsError}</p>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-4">
              {sessionRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs app-text-faint">{t('terminal.loadingRoster')}</p>
              ) : (
                sessionRows.map((row) => {
                  const isActive = row.terminalId === activeTerminalId;
                  const hasSession = Boolean(row.session);
                  const displayName = row.member?.displayName ?? row.member?.memberId ?? row.session?.memberId ?? 'Unassigned agent';
                  const normalizedStatus = row.status.toLowerCase();

                  return (
                    <div key={row.key}>
                      {/* Member Header */}
                      <div className="px-2 py-1.5 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium app-text-strong truncate">
                            {displayName}
                          </div>
                          <div className="text-[10px] app-text-faint">
                            {hasSession ? `${row.session?.terminalType || 'shell'} shell` : 'No shell session'}
                          </div>
                        </div>
                      </div>

                      {/* Session button */}
                      {hasSession && (
                        <div
                          className={`w-full text-left p-2.5 rounded-lg transition-all ${
                            isActive
                              ? 'bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border-l-2 border-l-cyan-500'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 ml-0.5'
                          }`}
                        >
                          <button type="button" onClick={() => selectSession(row.terminalId)} className="w-full text-left">
                            <div className="flex items-center gap-2 mb-1">
                              <StatusDot status={statusDotValue(normalizedStatus)} />
                              <span className="text-xs font-medium app-text-strong flex-1 truncate">
                                {row.terminalId}
                              </span>
                              {statusIsAbnormal(row.status) && <AlertTriangle size={13} className="text-red-600" />}
                            </div>
                            <div className="text-[10px] app-text-muted font-mono truncate ml-4">
                              {row.command}
                            </div>
                            <div className="mt-1 grid grid-cols-[14px_1fr] gap-x-1 gap-y-0.5 text-[10px] app-text-faint">
                              <Server size={11} className="mt-0.5" />
                              <span className="truncate">{row.node}</span>
                              <Activity size={11} className="mt-0.5" />
                              <span className="truncate">{row.restartSummary}</span>
                            </div>
                          </button>
                          <div className="mt-2 flex items-center justify-between text-[10px] app-text-faint">
                            <span>seq {row.session?.seq ?? 0} · {row.session?.subscriberCount ?? 0} viewers</span>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-red-600 disabled:opacity-50"
                              onClick={() => void handleCloseSession(row.terminalId)}
                              disabled={closingSessionId === row.terminalId}
                              aria-label={`Terminate ${row.terminalId}`}
                            >
                              <Square size={10} />
                              {closingSessionId === row.terminalId ? 'Stopping' : 'Stop'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Terminal Area */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="h-14 app-surface-strong border-b app-border-subtle px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TerminalIcon size={18} className="app-text-muted" />
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                  {(activeMember?.displayName ?? activeMember?.memberId ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium app-text-strong">{activeMember?.displayName ?? activeMember?.memberId ?? activeSession?.memberId ?? 'No member'}</div>
                  <div className="text-[10px] app-text-faint font-mono">{activeSession?.command ?? terminalRuntime.state.session?.command ?? activeTerminalId}</div>
                </div>
              </div>
              {getStatusBadge(activeSession?.status ?? activeMember?.terminalStatus ?? terminalRuntime.state.runtime.statusLabel)}
              {activeSession && (
                <div className="hidden lg:flex items-center gap-3 text-[10px] app-text-faint">
                  <span className="inline-flex items-center gap-1">
                    <Server size={12} />
                    {metadataText(activeSession.metadata, ['currentNode', 'nodeId', 'nodeName', 'podName'], 'unassigned')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Activity size={12} />
                    {metadataText(activeSession.metadata, ['previousNode', 'lastNode', 'failedNode'])
                      ? `restarted from ${metadataText(activeSession.metadata, ['previousNode', 'lastNode', 'failedNode'])}`
                      : 'no restart recorded'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleFollow}
                className={following ? 'app-accent-bg text-white border-transparent hover:opacity-90' : ''}
              >
                {following ? (
                  <>
                    <Play size={14} className="mr-1" />
                    Following
                  </>
                ) : (
                  <>
                    <Pause size={14} className="mr-1" />
                    Paused
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm">
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCloseSession()}
                disabled={!terminalRuntime.state.session?.terminalId || closingSession}
              >
                <X size={14} className="mr-1" />
                {closingSession ? 'Stopping...' : 'Terminate Shell'}
              </Button>
            </div>
          </div>

          {/* Terminal Output -- xterm.js panel kept as-is */}
          <div className="flex-1 p-4 app-bg-canvas overflow-hidden" data-terminal-runtime="connected-panel">
            <TerminalPanel
              state={terminalRuntime.state}
              onAttach={() => { void terminalRuntime.attach(); }}
              onRetry={() => { void terminalRuntime.retry(); }}
              onToggleFollow={handleToggleFollow}
              onSendInput={handleSendInput}
            />
          </div>

          {/* Status Footer */}
          <div className="h-10 app-surface-strong border-t app-border-subtle px-6 flex items-center gap-4 text-xs app-text-faint">
            <span className="font-mono">Session: {(terminalRuntime.state.session?.terminalId ?? activeTerminalId).slice(0, 12)}</span>
            <span>·</span>
            <span className="font-mono">Command: {activeSession?.command ?? terminalRuntime.state.session?.command ?? 'unknown'}</span>
            <span>·</span>
            <span>Status: {activeSession?.status ?? terminalRuntime.state.runtime.statusLabel}</span>
            <span>·</span>
            <span>Node: {activeSession ? metadataText(activeSession.metadata, ['currentNode', 'nodeId', 'nodeName', 'podName'], 'unassigned') : 'unassigned'}</span>
            <span>·</span>
            <span>Connection: {terminalRuntime.state.runtime.connection}</span>
          </div>
        </div>
      </div>

      {/* New Session Modal */}
      <Dialog open={newSessionModalOpen} onOpenChange={setNewSessionModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create New Terminal Session</DialogTitle>
            <DialogDescription>
              Launch a new PTY session for an AI agent or human operator
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Member Selection */}
            <div className="space-y-2">
              <Label htmlFor="member">Agent / Member</Label>
              <Select
                value={newSessionData.member}
                onValueChange={(value) =>
                  setNewSessionData((prev) => ({ ...prev, member: value }))
                }
              >
                <SelectTrigger id="member">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {roster.map((m) => (
                    <SelectItem key={m.memberId} value={m.memberId}>
                      <div className="flex items-center gap-2">
                        <StatusDot status={(m.terminalStatus ?? m.status ?? 'offline').toLowerCase() as 'online' | 'working' | 'offline'} />
                        <span>{m.displayName ?? m.memberId}</span>
                        <Badge variant="outline" className="text-xs ml-1">
                          {m.roleType ?? 'member'}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
              <Label htmlFor="provider">AI Provider</Label>
              <Select
                value={newSessionData.provider}
                onValueChange={(value) =>
                  setNewSessionData((prev) => ({ ...prev, provider: value }))
                }
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-code">
                    <div className="flex items-center gap-2">
                      <TerminalIcon size={14} />
                      <span>Claude Code</span>
                      <Badge variant="outline" className="text-xs">claude</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="gemini-cli">
                    <div className="flex items-center gap-2">
                      <TerminalIcon size={14} />
                      <span>Gemini CLI</span>
                      <Badge variant="outline" className="text-xs">gemini</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="codex-cli">
                    <div className="flex items-center gap-2">
                      <TerminalIcon size={14} />
                      <span>OpenAI Codex</span>
                      <Badge variant="outline" className="text-xs">codex</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="qwen-code">
                    <div className="flex items-center gap-2">
                      <TerminalIcon size={14} />
                      <span>Qwen Code</span>
                      <Badge variant="outline" className="text-xs">qwen</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="shell">
                    <div className="flex items-center gap-2">
                      <TerminalIcon size={14} />
                      <span>Shell</span>
                      <Badge variant="outline" className="text-xs">bash/zsh</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Working Directory */}
            <div className="space-y-2">
              <Label htmlFor="workingDir">Working Directory</Label>
              <Input
                id="workingDir"
                value={newSessionData.workingDir}
                onChange={(e) =>
                  setNewSessionData((prev) => ({ ...prev, workingDir: e.target.value }))
                }
                placeholder="~/workspace"
                className="font-mono text-sm"
              />
            </div>

            {/* Info Card */}
            <Card className="p-3 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <div className="text-xs space-y-1">
                <div className="font-semibold text-blue-900 dark:text-blue-300">
                  Session Info
                </div>
                <div className="text-blue-700 dark:text-blue-400">
                  PTY sessions are persistent and survive browser refresh
                </div>
                <div className="text-blue-700 dark:text-blue-400">
                  Terminal output auto-syncs to chat when stable
                </div>
                <div className="text-blue-700 dark:text-blue-400">
                  Status changes broadcast to all team members
                </div>
              </div>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSessionModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSession} disabled={!newSessionData.member}>
              <Plus size={14} className="mr-1" />
              Create Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
