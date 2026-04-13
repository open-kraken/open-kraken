import { useCallback, useEffect, useState } from 'react';
import {
  buildMembersPageModel,
  type MembersPageModel,
  type MemberCardModel,
  type TeamRosterModel,
  normalizeRoadmapTasksEnvelope,
  normalizeTeamsAndMembers,
} from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { getSkills } from '@/api/skills';
import { getNodes } from '@/api/nodes';
import { buildNodeBindingByMemberId } from '@/features/members/member-runtime-map';
import type { Skill } from '@/types/skill';
import type { MemberNodeBinding } from '@/features/members/member-runtime-map';
import { resolveOrCreateMemberSession } from '@/api/terminal';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusDot } from '@/components/ui/status-dot';
import { PixelAvatar } from '@/components/ui/pixel-avatar';
import {
  UserPlus,
  Bot,
  RefreshCw,
  Settings,
  Grid3x3,
  GitBranch,
  Plus,
  Terminal as TerminalIcon,
} from 'lucide-react';

/* ── Invite AI Assistant Modal (multi-step) ── */

interface Provider {
  id: string;
  /** Backend `terminalType` key — must match `provider.Registry` (claude, gemini, codex, opencode, qwen, shell). */
  terminalType: string;
  name: string;
  command: string;
  unlimitedFlag?: string;
  description: string;
}

const providers: Provider[] = [
  {
    id: 'claude-code',
    terminalType: 'claude',
    name: 'Claude Code',
    command: 'claude',
    unlimitedFlag: '--dangerously-skip-permissions',
    description: "Anthropic's coding assistant with comprehensive tooling",
  },
  {
    id: 'gemini-cli',
    terminalType: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    description: "Google's AI assistant for coding and analysis",
  },
  {
    id: 'codex-cli',
    terminalType: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    description: "OpenAI's code generation model",
  },
  {
    id: 'opencode',
    terminalType: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    description: 'Open source coding assistant',
  },
  {
    id: 'qwen-code',
    terminalType: 'qwen',
    name: 'Qwen Code',
    command: 'qwen',
    description: "Alibaba's coding model",
  },
  {
    id: 'shell',
    terminalType: 'shell',
    name: 'Shell',
    command: '$SHELL',
    description: 'Standard shell terminal session',
  },
];

function InviteAIAssistantModal({
  open,
  onOpenChange,
  teams = [],
  selectedTeam = '',
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams?: string[];
  selectedTeam?: string;
  onCreate: (config: {
    memberId: string;
    displayName: string;
    /** Frontend provider id (e.g. "claude-code"). */
    providerId: string;
    /** Backend terminalType key (e.g. "claude"). */
    terminalType: string;
    command: string;
    workingDir: string;
    team: string;
  }) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [command, setCommand] = useState('');
  const [workingDir, setWorkingDir] = useState('/home/user/project');
  const [team, setTeam] = useState(selectedTeam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProviderSelect = (provider: Provider) => {
    setSelectedProvider(provider);
    setCommand(
      provider.unlimitedFlag
        ? `${provider.command} ${provider.unlimitedFlag}`
        : provider.command
    );
  };

  const handleNextStep = () => {
    if (step === 1 && selectedProvider) setStep(2);
    else if (step === 2) setStep(3);
  };

  const handleCreate = async () => {
    if (!selectedProvider || !displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const memberId = displayName.trim().toLowerCase().replace(/\s+/g, '_');
      await onCreate({
        memberId,
        displayName: displayName.trim(),
        providerId: selectedProvider.id,
        terminalType: selectedProvider.terminalType,
        // Empty command lets the backend apply the provider's default — only override
        // if the user changed it to something other than the default.
        command: command && command !== selectedProvider.command ? command : '',
        workingDir,
        team,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedProvider(null);
    setDisplayName('');
    setCommand('');
    setWorkingDir('/home/user/project');
    setTeam(selectedTeam);
    setError(null);
    onOpenChange(false);
  };

  const teamList = teams.length > 0 ? teams : ['Workspace Team'];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5" />
            Invite AI Assistant
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Select the AI provider for your new assistant'}
            {step === 2 && 'Configure the AI assistant settings'}
            {step === 3 && 'Review and confirm the configuration'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Progress Indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 h-1 bg-cyan-500 rounded" />
            <div className={`flex-1 h-1 ${step >= 2 ? 'bg-cyan-500' : 'bg-gray-200 dark:bg-gray-700'} rounded`} />
            <div className={`flex-1 h-1 ${step >= 3 ? 'bg-cyan-500' : 'bg-gray-200 dark:bg-gray-700'} rounded`} />
          </div>

          {/* Step 1: Provider Selection */}
          {step === 1 && (
            <div className="space-y-3">
              <Label>Select AI Provider *</Label>
              <div className="grid grid-cols-2 gap-3">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider)}
                    className={`text-left p-4 rounded-lg border-2 transition-all hover:border-cyan-500 ${
                      selectedProvider?.id === provider.id
                        ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                        <TerminalIcon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm app-text-strong mb-1">
                          {provider.name}
                        </h4>
                        <p className="text-xs app-text-muted leading-relaxed">
                          {provider.description}
                        </p>
                        <code className="text-[10px] app-text-faint mt-2 block">
                          {provider.command}
                        </code>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Configuration */}
          {step === 2 && selectedProvider && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="displayName">Display Name *</Label>
                <Input
                  id="displayName"
                  placeholder={`e.g., ${selectedProvider.name} Backend`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs app-text-faint mt-1">
                  This name will appear in the team roster and chat
                </p>
              </div>
              <div>
                <Label htmlFor="command">Custom Command</Label>
                <Input
                  id="command"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="mt-1 font-mono text-sm"
                />
                <p className="text-xs app-text-faint mt-1">
                  Override the default command. Leave blank to use defaults.
                </p>
              </div>
              <div>
                <Label htmlFor="workingDir">Working Directory</Label>
                <Input
                  id="workingDir"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  className="mt-1 font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Step 3: Team Assignment & Review */}
          {step === 3 && selectedProvider && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="team">Assign to Team</Label>
                <Select value={team} onValueChange={setTeam}>
                  <SelectTrigger id="team" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teamList.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border app-border-subtle p-4 bg-gray-50 dark:bg-gray-900">
                <h4 className="font-semibold text-sm app-text-strong mb-3">
                  Configuration Summary
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="app-text-faint">Provider:</span>
                    <span className="app-text-strong font-medium">{selectedProvider.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Display Name:</span>
                    <span className="app-text-strong font-medium">{displayName || '(not set)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Command:</span>
                    <code className="text-xs app-text-strong">{command || selectedProvider.command}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Team:</span>
                    <span className="app-text-strong font-medium">{team}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Working Dir:</span>
                    <code className="text-xs app-text-strong">{workingDir}</code>
                  </div>
                </div>
              </div>

              {selectedProvider.unlimitedFlag && (
                <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-3">
                  <p className="text-xs app-text-muted">
                    This provider includes unlimited permission flags. Ensure proper
                    security policies are in place.
                  </p>
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t app-border-subtle">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button
                onClick={handleNextStep}
                disabled={step === 1 && !selectedProvider}
                className="app-accent-bg hover:opacity-90 text-white"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={() => void handleCreate()}
                disabled={!displayName || loading}
                className="app-accent-bg hover:opacity-90 text-white"
              >
                {loading ? 'Creating...' : 'Create Agent'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Helpers ── */

type StatusKey = 'idle' | 'running' | 'success' | 'error' | 'offline';

const statusToDisplay = (status: StatusKey): string => {
  switch (status) {
    case 'running': return 'Working...';
    case 'idle': return 'Online';
    case 'success': return 'Success';
    case 'error': return 'Error';
    case 'offline': return 'Offline';
    default: return status;
  }
};

const getRoleBadgeColor = (role: string) => {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'supervisor':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'assistant':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
};

const statusToDotVariant = (status: StatusKey) => {
  switch (status) {
    case 'running': return 'working' as const;
    case 'idle': return 'online' as const;
    case 'success': return 'success' as const;
    case 'error': return 'error' as const;
    case 'offline': return 'offline' as const;
    default: return 'offline' as const;
  }
};

const statusToAccentBar = (status: StatusKey) => {
  switch (status) {
    case 'idle': return 'bg-green-500';
    case 'running': return 'bg-yellow-500';
    case 'error': return 'bg-red-500';
    case 'offline': return 'bg-gray-300';
    default: return 'bg-gray-300';
  }
};

const emptyModel: MembersPageModel = {
  workspaceId: '',
  realtimeStatus: 'idle',
  metrics: { total: 0, running: 0, offline: 0 },
  teams: [],
  members: [],
};

/* ── Main Page ── */

export const MembersPage = () => {
  const { workspace, realtime, apiClient, navigate } = useAppShell();
  const [model, setModel] = useState<MembersPageModel>(emptyModel);
  const [nodeByMemberId, setNodeByMemberId] = useState<Record<string, MemberNodeBinding>>({});
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'org'>('grid');
  const [inviteAIModalOpen, setInviteAIModalOpen] = useState(false);

  const load = useCallback(async () => {
    const [membersResponse, roadmapResponse] = await Promise.all([
      apiClient.getMembers(),
      apiClient.getRoadmap(),
    ]);
    const { members, teamGroups } = normalizeTeamsAndMembers(
      membersResponse as Record<string, unknown>
    );
    const built = buildMembersPageModel({
      workspaceId: workspace.workspaceId,
      realtimeStatus: realtime.status,
      members,
      roadmapTasks: normalizeRoadmapTasksEnvelope(roadmapResponse),
      teamGroups,
    });
    setModel(built);
    if (!selectedTeamId && built.teams.length > 0) {
      setSelectedTeamId(built.teams[0].teamId);
    }
  }, [apiClient, realtime.status, workspace.workspaceId, selectedTeamId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) { /* surface via shell if needed */ }
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    void getSkills().then((res) => setAvailableSkills(res.skills));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { nodes } = await getNodes();
        if (!cancelled) setNodeByMemberId(buildNodeBindingByMemberId(nodes));
      } catch { /* optional topology */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Derived data
  const teams = model.teams;
  const activeTeam: TeamRosterModel | undefined =
    teams.find((t) => t.teamId === selectedTeamId) ?? teams[0];
  const rosterMembers = activeTeam?.members ?? model.members;

  const totalTeams = teams.length;
  const totalAgents = model.metrics.total;
  const runningCount = model.metrics.running;
  const offlineCount = model.metrics.offline;

  // Split members into humans (owner/supervisor/member without "assistant" feel) vs agents
  const isAgent = (m: MemberCardModel) => m.role === 'assistant';
  const humans = rosterMembers.filter((m) => !isAgent(m));
  const agents = rosterMembers.filter((m) => isAgent(m));

  const teamNames = teams.map((t) => t.name);

  const renderMemberCard = (member: MemberCardModel) => {
    const status = member.status as StatusKey;
    const node = nodeByMemberId[member.memberId];

    return (
      <Card
        key={member.memberId}
        className="kraken-card p-4 cursor-pointer hover:shadow-md transition-all relative overflow-hidden"
        onClick={() => navigate('terminal', { hash: member.terminalId })}
      >
        {/* Left accent bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusToAccentBar(status)}`} />

        <div className="flex items-start gap-3 ml-2">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <PixelAvatar name={member.displayName} size="lg" />
            <div className="absolute -bottom-0.5 -right-0.5">
              <StatusDot status={statusToDotVariant(status)} />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold app-text-strong text-sm truncate">
                {member.displayName}
              </h3>
              {isAgent(member) && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                  AI
                </Badge>
              )}
            </div>

            <Badge className={`text-[10px] px-2 py-0.5 h-5 ${getRoleBadgeColor(member.role)}`}>
              {member.roleLabel}
            </Badge>

            <div className="mt-2 text-xs app-text-faint capitalize">
              {statusToDisplay(status)}
            </div>

            {node && (
              <div className="mt-2 text-xs app-text-muted">
                Node: {node.hostname ?? node.nodeId}
              </div>
            )}

            {member.activeTask && (
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                  {member.activeTask}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold app-text-strong">Team Members</h1>
            </div>
            {/* Inline Metrics */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Teams:</span>
                <span className="font-semibold app-text-strong">{totalTeams}</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Agents:</span>
                <span className="font-semibold app-text-strong">{totalAgents}</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Running:</span>
                <span className="font-semibold text-green-600">{runningCount}</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="app-text-faint">Offline:</span>
                <span className="font-semibold app-text-faint">{offlineCount}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8">
              <UserPlus size={14} className="mr-1" />
              Invite Member
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInviteAIModalOpen(true)}
              className="app-accent-text h-8"
            >
              <Bot size={14} className="mr-1" />
              Invite AI Assistant
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => void load()}
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Team Tabs + View Toggle */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-2 flex items-center justify-between">
        <Tabs
          value={selectedTeamId || teams[0]?.teamId || ''}
          onValueChange={setSelectedTeamId}
        >
          <TabsList>
            {teams.map((team) => (
              <TabsTrigger key={team.teamId} value={team.teamId} className="flex items-center gap-2">
                <span>{team.name}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                  {team.metrics.total}
                </Badge>
              </TabsTrigger>
            ))}
            <Button variant="ghost" size="sm" className="ml-2">
              <Plus size={14} className="mr-1" />
              New Team
            </Button>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border app-border-subtle rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="h-7 px-2"
            >
              <Grid3x3 size={14} className="mr-1" />
              Grid
            </Button>
            <Button
              variant={viewMode === 'org' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('org')}
              className="h-7 px-2"
            >
              <GitBranch size={14} className="mr-1" />
              Org Chart
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Team Settings</DropdownMenuItem>
              <DropdownMenuItem>Manage Roles</DropdownMenuItem>
              <DropdownMenuItem>Export Members</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Context Bar */}
      <div className="app-bg-elevated border-b app-border-subtle px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4 app-text-faint">
          <span>
            Realtime:{' '}
            <span className="text-green-600 font-medium">{model.realtimeStatus}</span>
          </span>
          <span>-</span>
          <span>
            Team:{' '}
            <span className="app-text-strong font-medium">{activeTeam?.name ?? 'Workspace'}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Members Grid */}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'grid' ? (
          <div className="max-w-7xl mx-auto">
            {/* Humans */}
            {humans.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold app-text-strong">
                    Humans ({humans.length})
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {humans.map(renderMemberCard)}
                </div>
              </div>
            )}

            {/* AI Agents */}
            {agents.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold app-text-strong">
                    AI Agents ({agents.length})
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {agents.map(renderMemberCard)}
                </div>
              </div>
            )}

            {/* Empty state when no members at all */}
            {rosterMembers.length === 0 && (
              <div className="text-center py-12 app-text-muted">
                <Bot size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">No members in this team yet</p>
                <p className="text-xs mt-2">Invite a member or AI assistant to get started</p>
              </div>
            )}
          </div>
        ) : (
          /* Org Chart View */
          <div className="max-w-6xl mx-auto">
            <div className="text-center py-12 app-text-muted">
              <GitBranch size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm">Organizational chart view</p>
              <p className="text-xs mt-2">Hierarchy visualization coming soon</p>
            </div>
          </div>
        )}
      </div>

      {/* Invite AI Assistant Modal */}
      <InviteAIAssistantModal
        open={inviteAIModalOpen}
        onOpenChange={setInviteAIModalOpen}
        teams={teamNames}
        selectedTeam={activeTeam?.name ?? ''}
        onCreate={async (config) => {
          // 1. Create member via backend API
          await apiClient.createMember({
            memberId: config.memberId,
            displayName: config.displayName,
            roleType: 'assistant',
          });

          // 2. Create the terminal session with the chosen provider so the
          //    backend launches the real CLI (claude / gemini / ...) instead of bash.
          try {
            await resolveOrCreateMemberSession(workspace.workspaceId, config.memberId, {
              terminalType: config.terminalType,
              command: config.command,
              cwd: config.workingDir,
            });
          } catch {
            // Terminal session creation is best-effort; agent record still exists.
          }

          // 3. Reload the roster to show the new agent
          await load();
        }}
      />
    </div>
  );
};
