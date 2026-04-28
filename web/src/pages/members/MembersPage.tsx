import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { getHttpClient } from '@/api/http-binding';
import claudeLogo from '@/assets/provider-logos/claude.svg';
import geminiLogo from '@/assets/provider-logos/gemini.svg';
import openAILogo from '@/assets/provider-logos/openai.svg';
import qwenLogo from '@/assets/provider-logos/qwen.svg';
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
import { getAgentStatuses } from '@/api/agents';
import { getNodes } from '@/api/nodes';
import { buildNodeBindingByMemberId } from '@/features/members/member-runtime-map';
import type { Skill } from '@/types/skill';
import type { MemberNodeBinding } from '@/features/members/member-runtime-map';

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
  Code,
} from 'lucide-react';

/* ── Invite AI Assistant Modal (multi-step) ── */

interface Provider {
  id: string;
  /** Backend `terminalType` key — must match `provider.Registry` (claude, gemini, codex, opencode, qwen, shell). */
  terminalType: string;
  name: string;
  logoSrc?: string;
  logoClassName?: string;
  command: string;
  unlimitedFlag?: string;
  description: string;
}

type ProviderAuthDraft = {
  mode: 'api_key' | 'account' | 'none';
  account?: string;
  apiKey?: string;
  updatedAt?: string;
};

const agentGivenNames = [
  'Avery',
  'Blake',
  'Cameron',
  'Dakota',
  'Emerson',
  'Finley',
  'Harper',
  'Jordan',
  'Kendall',
  'Logan',
  'Morgan',
  'Parker',
  'Quinn',
  'Reese',
  'Riley',
  'Rowan',
  'Sawyer',
  'Taylor',
  'Skyler',
  'Casey',
];

const agentFamilyNames = [
  'Atlas',
  'Beacon',
  'Cipher',
  'Delta',
  'Echo',
  'Forge',
  'Harbor',
  'Ion',
  'Juno',
  'Keystone',
  'Lumen',
  'Matrix',
  'Nova',
  'Orbit',
  'Pulse',
  'Quartz',
  'Relay',
  'Summit',
  'Vector',
  'Zenith',
];

const randomInt = (max: number) => {
  if (max <= 0) return 0;
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const value = new Uint32Array(1);
    cryptoApi.getRandomValues(value);
    return value[0] % max;
  }
  return Math.floor(Math.random() * max);
};

const memberIdFromName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const buildUniqueAgentIdentities = (
  count: number,
  existingMemberIds: string[],
  existingDisplayNames: string[],
) => {
  const usedIds = new Set(existingMemberIds.map((id) => id.toLowerCase()));
  const usedNames = new Set(existingDisplayNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const identities: Array<{ memberId: string; displayName: string }> = [];
  const totalCombinations = agentGivenNames.length * agentFamilyNames.length;
  let offset = randomInt(totalCombinations);
  let attempts = 0;

  while (identities.length < count && attempts < totalCombinations + count * 10) {
    const index = (offset + attempts) % totalCombinations;
    const given = agentGivenNames[index % agentGivenNames.length];
    const family = agentFamilyNames[Math.floor(index / agentGivenNames.length) % agentFamilyNames.length];
    let displayName = `${given} ${family}`;
    let memberId = `ai_${memberIdFromName(displayName)}`;
    let suffix = 2;
    while (usedNames.has(displayName.toLowerCase()) || usedIds.has(memberId.toLowerCase())) {
      displayName = `${given} ${family} ${suffix}`;
      memberId = `ai_${memberIdFromName(displayName)}`;
      suffix += 1;
    }
    usedNames.add(displayName.toLowerCase());
    usedIds.add(memberId.toLowerCase());
    identities.push({ memberId, displayName });
    attempts += 1;
    offset += 1;
  }

  return identities;
};

const providers: Provider[] = [
  {
    id: 'claude-code',
    terminalType: 'claude',
    name: 'Claude Code',
    logoSrc: claudeLogo,
    logoClassName: 'h-7 w-20',
    command: 'claude',
    unlimitedFlag: '--dangerously-skip-permissions',
    description: "Anthropic's coding assistant with comprehensive tooling",
  },
  {
    id: 'gemini-cli',
    terminalType: 'gemini',
    name: 'Gemini CLI',
    logoSrc: geminiLogo,
    command: 'gemini',
    description: "Google's AI assistant for coding and analysis",
  },
  {
    id: 'codex-cli',
    terminalType: 'codex',
    name: 'Codex CLI',
    logoSrc: openAILogo,
    logoClassName: 'h-7 w-20',
    command: 'codex',
    description: "OpenAI's code generation model",
  },
  {
    id: 'qwen-code',
    terminalType: 'qwen',
    name: 'Qwen Code',
    logoSrc: qwenLogo,
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
  existingMemberIds = [],
  existingDisplayNames = [],
  onCreate,
  providerAuth = {},
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams?: Array<{ teamId: string; name: string }>;
  selectedTeam?: string;
  existingMemberIds?: string[];
  existingDisplayNames?: string[];
  onCreate: (config: {
    agents: Array<{ memberId: string; displayName: string }>;
    /** Frontend provider id (e.g. "claude-code"). */
    providerId: string;
    /** Backend terminalType key (e.g. "claude"). */
    terminalType: string;
    command: string;
    workingDir: string;
    teamId: string;
    providerAuth?: ProviderAuthDraft;
  }) => Promise<void>;
  providerAuth?: Record<string, { hasApiKey?: boolean; account?: string; mode?: string }>;
}) {
  const [step, setStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [agentCount, setAgentCount] = useState('1');
  const [authMode, setAuthMode] = useState<ProviderAuthDraft['mode']>('api_key');
  const [authAccount, setAuthAccount] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [command, setCommand] = useState('');
  const [workingDir, setWorkingDir] = useState('/');
  const [teamId, setTeamId] = useState(selectedTeam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTeamId(selectedTeam);
    }
  }, [open, selectedTeam]);

  const handleProviderSelect = (provider: Provider) => {
    setSelectedProvider(provider);
    const existingAuth = providerAuth[provider.id];
    setAuthMode((existingAuth?.mode as ProviderAuthDraft['mode'] | undefined) ?? 'api_key');
    setAuthAccount(existingAuth?.account ?? '');
    setApiKey('');
    setCommand(
      provider.unlimitedFlag
        ? `${provider.command} ${provider.unlimitedFlag}`
        : provider.command
    );
  };

  const resolvedCount = Math.max(1, Math.min(50, Number.parseInt(agentCount, 10) || 1));
  const selectedProviderAuth = selectedProvider ? providerAuth[selectedProvider.id] : undefined;
  const needsAuth = Boolean(
    selectedProvider &&
      selectedProvider.id !== 'shell' &&
      authMode === 'api_key' &&
      !selectedProviderAuth?.hasApiKey &&
      !apiKey.trim(),
  );

  const handleNextStep = () => {
    setError(null);
    if (step === 1 && selectedProvider) {
      setStep(2);
      return;
    }
    if (step === 2) {
      if (needsAuth) {
        setError('Paste an API key, use a saved key, or switch to Existing CLI login.');
        return;
      }
      setStep(3);
    }
  };

  const handleCreate = async () => {
    if (!selectedProvider || needsAuth) return;
    setLoading(true);
    setError(null);
    try {
      const agents = buildUniqueAgentIdentities(resolvedCount, existingMemberIds, existingDisplayNames);
      await onCreate({
        agents,
        providerId: selectedProvider.id,
        terminalType: selectedProvider.terminalType,
        // Empty command lets the backend apply the provider's default — only override
        // if the user changed it to something other than the default.
        command: command && command !== selectedProvider.command ? command : '',
        workingDir,
        teamId,
        providerAuth:
          selectedProvider.id === 'shell'
            ? undefined
            : {
                mode: authMode,
                account: authAccount.trim(),
                apiKey: apiKey.trim(),
                updatedAt: new Date().toISOString(),
              },
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
    setAgentCount('1');
    setAuthMode('api_key');
    setAuthAccount('');
    setApiKey('');
    setCommand('');
    setWorkingDir('/');
    setTeamId(selectedTeam);
    setError(null);
    onOpenChange(false);
  };

  const teamList = teams.length > 0 ? teams : [{ teamId: 'team_default', name: 'Workspace team' }];
  const selectedTeamName = teamList.find((t) => t.teamId === teamId)?.name ?? teamId;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5" />
            Invite AI Assistant
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Select the AI provider for your new assistant'}
            {step === 2 && 'Choose how many agents to create and provide CLI authorization'}
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
                {providers.map((provider) => {
                  const auth = providerAuth[provider.id];
                  const needsAuth = provider.id !== 'shell' && !auth?.hasApiKey && !auth?.account;
                  return (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider)}
                    className={`text-left p-4 rounded-lg border-2 transition-all hover:border-cyan-500 ${
                      selectedProvider?.id === provider.id
                        ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="flex h-10 w-24 shrink-0 items-center justify-center">
                        {provider.logoSrc ? (
                          <img src={provider.logoSrc} alt="" className={`object-contain ${provider.logoClassName ?? 'h-8 w-8'}`} />
                        ) : (
                          <Code size={18} aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-col items-center gap-1">
                          <h4 className="font-semibold text-sm app-text-strong">
                            {provider.name}
                          </h4>
                          {needsAuth && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-yellow-600 border-yellow-500">
                              Needs auth
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs app-text-muted leading-relaxed">
                          {provider.description}
                        </p>
                        <code className="text-[10px] app-text-faint mt-2 block">
                          {provider.command}
                        </code>
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Configuration */}
          {step === 2 && selectedProvider && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="agentCount">AI Agent Count</Label>
                <Input
                  id="agentCount"
                  type="number"
                  min={1}
                  max={50}
                  value={agentCount}
                  onChange={(e) => setAgentCount(e.target.value)}
                  className="mt-1"
                />
                  <p className="text-xs app-text-faint mt-1">
                    Names are generated automatically as unique English names.
                  </p>
              </div>
              {selectedProvider.id !== 'shell' && (
                <div className="rounded-lg border app-border-subtle p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="authMode">AI CLI Authorization</Label>
                      <p className="text-xs app-text-faint mt-1">
                        API keys are saved to your settings and injected into new CLI sessions automatically.
                      </p>
                    </div>
                    {(selectedProviderAuth?.hasApiKey || selectedProviderAuth?.account) && (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Saved
                      </Badge>
                    )}
                  </div>
                  <Select value={authMode} onValueChange={(value) => setAuthMode(value as ProviderAuthDraft['mode'])}>
                    <SelectTrigger id="authMode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API key</SelectItem>
                      <SelectItem value="account">Existing CLI login</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={authAccount}
                    onChange={(event) => setAuthAccount(event.target.value)}
                    placeholder={authMode === 'account' ? 'Optional login note' : 'Account or login note'}
                  />
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={selectedProviderAuth?.hasApiKey ? 'API key already saved' : 'Paste API key for automatic CLI authorization'}
                    disabled={authMode !== 'api_key'}
                  />
                  {needsAuth && (
                    <p className="text-xs text-yellow-600">
                      Paste an API key, use a saved key, or switch to Existing CLI login.
                    </p>
                  )}
                  {authMode === 'account' && !selectedProviderAuth?.account && (
                    <p className="text-xs app-text-faint">
                      This uses the CLI account already logged in on the host. The note is optional.
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label htmlFor="workingDir">Working Directory</Label>
                <Input
                  id="workingDir"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  className="mt-1 font-mono text-sm"
                />
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
                  Optional. Leave unchanged to use the provider default.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Team Assignment & Review */}
          {step === 3 && selectedProvider && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="team">Assign to Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger id="team" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teamList.map((t) => (
                      <SelectItem key={t.teamId} value={t.teamId}>
                        {t.name}
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
                    <span className="app-text-faint">Agents:</span>
                    <span className="app-text-strong font-medium">{resolvedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Name mode:</span>
                    <span className="app-text-strong font-medium">Random unique English names</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Command:</span>
                    <code className="text-xs app-text-strong">{command || selectedProvider.command}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Team:</span>
                    <span className="app-text-strong font-medium">{selectedTeamName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="app-text-faint">Working Dir:</span>
                    <code className="text-xs app-text-strong">{workingDir}</code>
                  </div>
                  {selectedProvider.id !== 'shell' && (
                    <div className="flex justify-between">
                      <span className="app-text-faint">Authorization:</span>
                      <span className="app-text-strong font-medium">
                        {authMode === 'api_key'
                          ? apiKey.trim() || selectedProviderAuth?.hasApiKey
                            ? 'API key'
                            : 'Missing'
                          : authMode === 'account'
                            ? 'Existing CLI login'
                            : 'None'}
                      </span>
                    </div>
                  )}
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

          {step !== 3 && error && (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs text-red-600">{error}</p>
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
                disabled={(step === 1 && !selectedProvider) || (step === 2 && needsAuth)}
                className="app-accent-bg hover:opacity-90 text-white"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={() => void handleCreate()}
                disabled={needsAuth || loading}
                className="app-accent-bg hover:opacity-90 text-white"
              >
                {loading ? 'Creating...' : `Create ${resolvedCount} Agent${resolvedCount === 1 ? '' : 's'}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewTeamModal({
  open,
  onOpenChange,
  existingTeamIds,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTeamIds: string[];
  onCreate: (input: { teamId: string; name: string }) => Promise<void>;
}) {
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTeamName('');
      setTeamId('');
      setError(null);
    }
  }, [open]);

  const resolvedTeamId = (teamId.trim() || teamIdFromName(teamName)).trim();
  const resolvedTeamName = teamName.trim() || resolvedTeamId;
  const hasManualTeamId = teamId.trim().length > 0;
  const invalidTeamId = Boolean(resolvedTeamId) && !isValidTeamId(resolvedTeamId);
  const duplicate = resolvedTeamId
    ? existingTeamIds.some((id) => id.toLowerCase() === resolvedTeamId.toLowerCase())
    : false;

  const handleCreate = async () => {
    if (!resolvedTeamId || duplicate || invalidTeamId) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate({ teamId: resolvedTeamId, name: resolvedTeamName });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5" />
            New Team
          </DialogTitle>
          <DialogDescription>
            Create a workspace team for grouping members and AI assistants.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="newTeamName">Team Name</Label>
            <Input
              id="newTeamName"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="e.g., Backend Squad"
              disabled={loading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="newTeamId">Team ID</Label>
            <Input
              id="newTeamId"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              placeholder={teamName ? teamIdFromName(teamName) : 'e.g., backend_squad'}
              disabled={loading}
              className="mt-1 font-mono text-sm"
            />
            <p className="text-xs app-text-faint mt-1">
              Used by APIs and mentions. Leave blank to generate it from the name.
            </p>
            <div className="mt-2 rounded-lg border app-border-subtle app-bg-elevated px-3 py-2 text-xs">
              <span className="app-text-faint">Preview: </span>
              <span className="font-mono app-text-strong">{resolvedTeamId || 'team_id'}</span>
              {!hasManualTeamId && teamName.trim() && (
                <span className="ml-2 app-text-faint">auto-generated</span>
              )}
            </div>
          </div>

          {invalidTeamId && (
            <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs text-red-600">
                Team ID must start with a lowercase letter and only contain lowercase letters, numbers, and underscores.
              </p>
            </div>
          )}

          {duplicate && (
            <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs text-red-600">A team with this ID already exists.</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t app-border-subtle">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!resolvedTeamId || duplicate || invalidTeamId || loading}
            className="app-accent-bg hover:opacity-90 text-white"
          >
            {loading ? 'Creating...' : 'Create Team'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberModal({
  open,
  onOpenChange,
  teams,
  selectedTeam,
  existingMemberIds,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Array<{ teamId: string; name: string }>;
  selectedTeam: string;
  existingMemberIds: string[];
  onCreate: (input: { memberId: string; displayName: string; roleType: string; teamId: string }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [roleType, setRoleType] = useState('member');
  const [teamId, setTeamId] = useState(selectedTeam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTeamId(selectedTeam);
      setDisplayName('');
      setMemberId('');
      setRoleType('member');
      setError(null);
    }
  }, [open, selectedTeam]);

  const resolvedMemberId = (memberId.trim() || idFromName(displayName)).trim();
  const resolvedDisplayName = displayName.trim() || resolvedMemberId;
  const duplicate = resolvedMemberId
    ? existingMemberIds.some((id) => id.toLowerCase() === resolvedMemberId.toLowerCase())
    : false;
  const teamList = teams.length > 0 ? teams : [{ teamId: 'team_default', name: 'Workspace team' }];

  const handleCreate = async () => {
    if (!resolvedMemberId || duplicate) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate({
        memberId: resolvedMemberId,
        displayName: resolvedDisplayName,
        roleType,
        teamId: teamId || teamList[0]?.teamId || 'team_default',
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Invite Member
          </DialogTitle>
          <DialogDescription>
            Add a human workspace member to the selected team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="inviteMemberName">Display Name</Label>
            <Input
              id="inviteMemberName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g., Ada Lovelace"
              disabled={loading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="inviteMemberId">Member ID</Label>
            <Input
              id="inviteMemberId"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              placeholder={displayName ? idFromName(displayName) : 'e.g., ada_lovelace'}
              disabled={loading}
              className="mt-1 font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="inviteMemberRole">Role</Label>
            <Select value={roleType} onValueChange={setRoleType}>
              <SelectTrigger id="inviteMemberRole" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="inviteMemberTeam">Team</Label>
            <Select value={teamId || teamList[0]?.teamId} onValueChange={setTeamId}>
              <SelectTrigger id="inviteMemberTeam" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamList.map((team) => (
                  <SelectItem key={team.teamId} value={team.teamId}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {duplicate && (
            <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs text-red-600">A member with this ID already exists.</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t app-border-subtle">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!resolvedMemberId || duplicate || loading}
            className="app-accent-bg hover:opacity-90 text-white"
          >
            {loading ? 'Inviting...' : 'Invite Member'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Helpers ── */

type StatusKey = 'idle' | 'running' | 'success' | 'error' | 'offline';

const idFromName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const teamIdFromName = (name: string) =>
  idFromName(name);

const isValidTeamId = (value: string) => /^[a-z][a-z0-9_]*$/.test(value);

const realtimeToneClass = (status: string) => {
  switch (status) {
    case 'connected':
      return 'text-green-600';
    case 'connecting':
    case 'reconnecting':
      return 'text-yellow-600';
    default:
      return 'text-red-600';
  }
};

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
  metrics: { total: 0, aiAssistants: 0, running: 0, offline: 0 },
  teams: [],
  members: [],
};

/* ── Main Page ── */

export const MembersPage = () => {
  const { workspace, realtime, apiClient, navigate, pushNotification } = useAppShell();
  const { account } = useAuth();
  const [model, setModel] = useState<MembersPageModel>(emptyModel);
  const [nodeByMemberId, setNodeByMemberId] = useState<Record<string, MemberNodeBinding>>({});
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [providerAuth, setProviderAuth] = useState<Record<string, { hasApiKey?: boolean; account?: string; mode?: string }>>({});
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'org'>('grid');
  const [inviteMemberModalOpen, setInviteMemberModalOpen] = useState(false);
  const [inviteAIModalOpen, setInviteAIModalOpen] = useState(false);
  const [newTeamModalOpen, setNewTeamModalOpen] = useState(false);

  const load = useCallback(async () => {
    const [membersResponse, roadmapResponse, agentStatusResponse] = await Promise.all([
      apiClient.getMembers(),
      apiClient.getRoadmap(),
      getAgentStatuses(workspace.workspaceId).catch(() => ({ agents: [] })),
    ]);
    const { members, teamGroups } = normalizeTeamsAndMembers(
      membersResponse as Record<string, unknown>
    );
    const statusByAgent = new Map(agentStatusResponse.agents.map((agent) => [agent.agentId, agent]));
    const mergedMembers = members.map((member) => {
      const status = statusByAgent.get(member.memberId);
      if (!status) return member;
      return {
        ...member,
        terminalId: status.terminalId ?? member.terminalId,
        terminalStatus: status.terminalStatus ?? member.terminalStatus,
        agentRuntimeState: status.runtimeState ?? member.agentRuntimeState,
        runtimeReady: status.runtimeReady,
        nodeId: status.nodeId || member.nodeId,
        nodeHostname: status.nodeHostname || member.nodeHostname,
        manualStatus: status.presenceStatus === 'unknown' ? member.manualStatus : status.presenceStatus,
      };
    });
    const mergedTeamGroups = teamGroups.map((team) => ({
      ...team,
      members: team.members.map((member) => mergedMembers.find((item) => item.memberId === member.memberId) ?? member),
    }));
    const built = buildMembersPageModel({
      workspaceId: workspace.workspaceId,
      realtimeStatus: realtime.status,
      members: mergedMembers,
      roadmapTasks: normalizeRoadmapTasksEnvelope(roadmapResponse),
      teamGroups: mergedTeamGroups,
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
    if (!account?.memberId) return;
    const http = getHttpClient();
    void http
      .get<{ providerAuth?: Record<string, { hasApiKey?: boolean; account?: string; mode?: string }> }>(
        `settings?memberId=${encodeURIComponent(account.memberId)}`,
      )
      .then((settings) => setProviderAuth(settings.providerAuth ?? {}))
      .catch(() => setProviderAuth({}));
  }, [account?.memberId]);

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
  const pushRealtimeMutationNotice = useCallback(
    (title: string, detail: string) => {
      pushNotification({ tone: 'info', title, detail });
      if (realtime.status !== 'connected') {
        pushNotification({
          tone: 'warning',
          title: 'Realtime not connected',
          detail: `Saved successfully, but live updates are ${realtime.status}. Use Refresh if the roster does not update immediately.`,
        });
      }
    },
    [pushNotification, realtime.status],
  );

  const totalTeams = teams.length;
  const totalAgents = model.metrics.aiAssistants;
  const runningCount = model.metrics.running;
  const offlineCount = model.metrics.offline;

  // Split members into humans (owner/supervisor/member without "assistant" feel) vs agents
  const isAgent = (m: MemberCardModel) => m.role === 'assistant';
  const humans = rosterMembers.filter((m) => !isAgent(m));
  const agents = rosterMembers.filter((m) => isAgent(m));

  const teamOptions = teams.map((t) => ({ teamId: t.teamId, name: t.name }));

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

            {isAgent(member) && (
              <div className="mt-2 text-xs app-text-muted">
                Runtime: {member.runtimeState ?? (member.runtimeReady ? 'ready' : 'pending')}
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
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setInviteMemberModalOpen(true)}
            >
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
                  {team.members.length}
                </Badge>
              </TabsTrigger>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={() => setNewTeamModalOpen(true)}
            >
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
            <span className={`${realtimeToneClass(model.realtimeStatus)} font-medium`}>{model.realtimeStatus}</span>
          </span>
          <span>-</span>
          <span>
            Team:{' '}
            <span className="app-text-strong font-medium">{activeTeam?.name ?? 'Workspace'}</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${
                realtime.status === 'connected'
                  ? 'bg-green-500 animate-pulse'
                  : realtime.status === 'connecting' || realtime.status === 'reconnecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
              }`}
            />
            {realtime.status === 'connected'
              ? 'Live'
              : realtime.status === 'connecting'
                ? 'Connecting'
                : realtime.status === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Disconnected'}
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
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="rounded-lg border app-border-subtle app-surface-strong p-5">
              <div className="flex items-center gap-2 mb-4">
                <GitBranch size={18} className="app-accent-text" />
                <h2 className="font-semibold app-text-strong">{activeTeam?.name ?? 'Workspace'} Org Chart</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {(['owner', 'supervisor', 'member', 'assistant'] as const).map((role) => {
                  const roleMembers = rosterMembers.filter((member) => member.role === role);
                  if (roleMembers.length === 0) return null;
                  return (
                    <div key={role} className="grid grid-cols-[120px_1fr] gap-4 items-start">
                      <div className="pt-3 text-xs font-semibold uppercase app-text-faint">{role}</div>
                      <div className="flex flex-wrap gap-3">
                        {roleMembers.map((member) => (
                          <button
                            key={member.memberId}
                            type="button"
                            className="min-w-[220px] rounded-lg border app-border-subtle app-bg-surface p-3 text-left hover:shadow-sm"
                            onClick={() => navigate('terminal', { hash: member.terminalId })}
                          >
                            <div className="flex items-center gap-3">
                              <PixelAvatar name={member.displayName} size="sm" />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold app-text-strong">{member.displayName}</div>
                                <div className="truncate text-xs app-text-faint">{member.memberId}</div>
                              </div>
                              <StatusDot status={statusToDotVariant(member.status as StatusKey)} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invite AI Assistant Modal */}
      <InviteMemberModal
        open={inviteMemberModalOpen}
        onOpenChange={setInviteMemberModalOpen}
        teams={teamOptions}
        selectedTeam={activeTeam?.teamId ?? 'team_default'}
        existingMemberIds={model.members.map((member) => member.memberId)}
        onCreate={async (config) => {
          await apiClient.createMember({
            memberId: config.memberId,
            displayName: config.displayName,
            roleType: config.roleType,
            manualStatus: 'online',
            terminalStatus: 'offline',
            createRuntime: false,
            teamId: config.teamId,
          });
          await load();
          pushRealtimeMutationNotice('Member invited', `${config.displayName} added to ${config.teamId}.`);
        }}
      />

      {/* Invite AI Assistant Modal */}
      <InviteAIAssistantModal
        open={inviteAIModalOpen}
        onOpenChange={setInviteAIModalOpen}
        teams={teamOptions}
        selectedTeam={activeTeam?.teamId ?? 'team_default'}
        existingMemberIds={model.members.map((member) => member.memberId)}
        existingDisplayNames={model.members.map((member) => member.displayName)}
        providerAuth={providerAuth}
        onCreate={async (config) => {
          if (config.providerAuth && account?.memberId) {
            const http = getHttpClient();
            const current: Record<string, unknown> & { providerAuth?: Record<string, ProviderAuthDraft> } = await http
              .get<Record<string, unknown> & { providerAuth?: Record<string, ProviderAuthDraft> }>(
                `settings?memberId=${encodeURIComponent(account.memberId)}`,
              )
              .catch(() => ({ providerAuth: {} as Record<string, ProviderAuthDraft> }));
            await http.request('settings', {
              method: 'PUT',
              body: {
                ...current,
                memberId: account.memberId,
                providerAuth: {
                  ...(current.providerAuth ?? {}),
                  [config.providerId]: {
                    ...(current.providerAuth?.[config.providerId] ?? {}),
                    ...config.providerAuth,
                  },
                },
              },
            });
            setProviderAuth((prev) => ({
              ...prev,
              [config.providerId]: {
                ...prev[config.providerId],
                mode: config.providerAuth?.mode,
                account: config.providerAuth?.account,
                hasApiKey: Boolean(config.providerAuth?.apiKey) || prev[config.providerId]?.hasApiKey,
              },
            }));
          }
          let createError: unknown;
          try {
            for (const agent of config.agents) {
              await apiClient.createMember({
                memberId: agent.memberId,
                displayName: agent.displayName,
                roleType: 'assistant',
                manualStatus: 'online',
                terminalStatus: 'starting',
                createRuntime: true,
                providerId: config.providerId,
                terminalType: config.terminalType,
                agentType: 'assistant',
                command: config.command,
                workingDir: config.workingDir,
                teamId: config.teamId,
              });
            }
          } catch (err) {
            createError = err;
          } finally {
            await load();
          }
          if (createError) {
            throw createError;
          }
          pushRealtimeMutationNotice(
            'AI assistant invited',
            `${config.agents.length} assistant${config.agents.length === 1 ? '' : 's'} added to ${config.teamId}.`,
          );
        }}
      />
      <NewTeamModal
        open={newTeamModalOpen}
        onOpenChange={setNewTeamModalOpen}
        existingTeamIds={teams.map((team) => team.teamId)}
        onCreate={async ({ teamId, name }) => {
          await apiClient.createTeam({
            teamId,
            name,
            memberIds: [],
          });
          setSelectedTeamId(teamId);
          await load();
          pushRealtimeMutationNotice('Team created', name);
        }}
      />
    </div>
  );
};
