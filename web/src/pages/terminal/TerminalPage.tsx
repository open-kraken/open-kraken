import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { TerminalPanel } from '@/features/terminal/TerminalPanel';
import { normalizeMembersEnvelope, type MemberFixture } from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { useAuth } from '@/auth/AuthProvider';
import { sendTerminalInput, closeTerminalSession, resolveOrCreateMemberSession } from '@/api/terminal';
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
} from 'lucide-react';

const fallbackTerminalIdForMember = (memberId: string) => `term_${memberId}`;
const terminalIdForMember = (member: Pick<MemberFixture, 'memberId' | 'terminalId'>) =>
  member.terminalId?.trim() || fallbackTerminalIdForMember(member.memberId);
const acceptsTerminalHash = (raw: string) => raw.startsWith('term_') || raw.startsWith('session-');

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
  const [closingSession, setClosingSession] = useState(false);
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

  // Group sessions by member — show all roster members so any can be attached
  const sessionsByMember = useMemo(() => {
    return roster.map((m) => ({
      member: m,
      terminalId: terminalIdForMember(m),
    }));
  }, [roster]);

  const totalSessions = roster.length;
  const activeSessions = roster.filter((member) => {
    const ts = (member.terminalStatus ?? member.manualStatus ?? member.status ?? '').toLowerCase();
    return ['online', 'working', 'running'].includes(ts);
  }).length;
  const workingSessions = roster.filter((member) => {
    const ts = (member.terminalStatus ?? member.manualStatus ?? member.status ?? '').toLowerCase();
    return ['working', 'running'].includes(ts);
  }).length;

  const activeMember = useMemo(() => {
    const sessionMemberId = terminalRuntime.state.session?.memberId;
    if (sessionMemberId) {
      return roster.find((m) => m.memberId === sessionMemberId);
    }
    return roster.find((m) => terminalIdForMember(m) === activeTerminalId);
  }, [roster, terminalRuntime.state.session?.memberId, activeTerminalId]);

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
  }, [newSessionData, workspace.workspaceId, pushNotification, t, setHashForTerminal, terminalRuntime]);

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
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <Radio size={8} className="mr-1 animate-pulse" />
            Working
          </Badge>
        );
      case 'offline':
        return (
          <Badge variant="outline" className="text-gray-500 border-gray-500">
            <Circle size={8} className="mr-1" />
            Offline
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
                <span className="font-semibold app-text-strong">{totalSessions || roster.length}</span>
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8">
              <RefreshCw size={14} className="mr-1" />
              Refresh
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
              {activeSessions} active · {totalSessions || roster.length} total
            </p>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-4">
              {roster.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs app-text-faint">{t('terminal.loadingRoster')}</p>
              ) : (
                roster.map((member) => {
                  const tid = terminalIdForMember(member);
                  const isActive = tid === activeTerminalId;
                  const hasSession = Boolean(member.terminalStatus);

                  return (
                    <div key={member.memberId}>
                      {/* Member Header */}
                      <div className="px-2 py-1.5 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                          {(member.displayName ?? member.memberId).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium app-text-strong truncate">
                            {member.displayName ?? member.memberId}
                          </div>
                          <div className="text-[10px] app-text-faint">
                            {hasSession ? '1 session' : 'No session'}
                          </div>
                        </div>
                      </div>

                      {/* Session button */}
                      {hasSession && (
                        <button
                          onClick={() => selectSession(tid)}
                          className={`w-full text-left p-2.5 rounded-lg transition-all ${
                            isActive
                              ? 'bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border-l-2 border-l-cyan-500'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 ml-0.5'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <StatusDot status={(member.terminalStatus ?? 'offline').toLowerCase() as 'online' | 'working' | 'offline'} />
                            <span className="text-xs font-medium app-text-strong flex-1 truncate">
                              {tid}
                            </span>
                          </div>
                          <div className="text-[10px] app-text-faint font-mono truncate ml-4">
                            {member.terminalStatus ?? 'offline'}
                          </div>
                        </button>
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
                  <div className="text-sm font-medium app-text-strong">{activeMember?.displayName ?? activeMember?.memberId ?? 'No member'}</div>
                  <div className="text-[10px] app-text-faint">{terminalRuntime.state.session?.command ?? activeTerminalId}</div>
                </div>
              </div>
              {activeMember?.terminalStatus && getStatusBadge(activeMember.terminalStatus)}
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
                {closingSession ? 'Closing...' : 'Close Session'}
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
            <span className="font-mono">Working Dir: {terminalRuntime.state.session?.command ?? '~/workspace'}</span>
            <span>·</span>
            <span>Status: {terminalRuntime.state.runtime.statusLabel}</span>
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
