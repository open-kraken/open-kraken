import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  Server,
  Shield,
  Zap,
  DollarSign,
  Terminal,
  Cpu,
  HardDrive,
  Network as NetworkIcon,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getAgentStatuses, type AgentStatus } from '@/api/agents';
import { getNodes } from '@/api/nodes';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { normalizeTeamsAndMembers, type TeamGroupFixture } from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { useDashboardStore } from '@/state/dashboardStore';
import type { Node } from '@/types/node';

type PeriodOption = '24h' | '7d' | '30d';

type TeamCard = {
  name: string;
  activeAgents: number;
  totalAgents: number;
  queuedTasks: number;
  failedTasks: number;
  spend: number;
  health: 'healthy' | 'warning';
};

const statusIsActive = (status: string) =>
  ['running', 'working', 'busy', 'in_progress', 'online', 'idle', 'scheduled'].includes(status.toLowerCase());

const agentStatusValue = (agent: AgentStatus) =>
  agent.runtimeState ?? agent.terminalStatus ?? agent.presenceStatus ?? '';

const formatRelativeTime = (iso: string | null) => {
  if (!iso) return '-';
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '-';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const chartKeyForTeam = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'team';

const chartColors = ['#3b82f6', '#a855f7', '#22c55e', '#f97316', '#06b6d4', '#ef4444', '#14b8a6', '#eab308'];

const handleActionKey = (event: KeyboardEvent<HTMLElement>, action: () => void) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
};

const terminalHashForAgent = (agentId: string, terminalId?: string | null) =>
  terminalId || `term_${agentId}`;

export const DashboardPage = () => {
  const { navigate, workspace, apiClient } = useAppShell();
  const store = useDashboardStore();
  const [period, setPeriod] = useState<PeriodOption>('7d');
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroupFixture[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    void store.loadDashboard();
  }, [store.loadDashboard]);

  const loadRuntime = useCallback(async () => {
    setRuntimeError(null);
    try {
      const [agentsRes, nodesRes, membersRes] = await Promise.all([
        getAgentStatuses(workspace.workspaceId),
        getNodes(),
        apiClient.getMembers(),
      ]);
      setAgentStatuses(agentsRes.agents);
      setNodes(nodesRes.nodes);
      setTeamGroups(normalizeTeamsAndMembers(membersRes as Record<string, unknown>).teamGroups);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Dashboard runtime data failed to load.');
    }
  }, [apiClient, workspace.workspaceId]);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  const teamByMemberId = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamGroups) {
      for (const member of team.members) {
        map.set(member.memberId, team.name ?? team.teamId);
      }
    }
    return map;
  }, [teamGroups]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamGroups) {
      for (const member of team.members) {
        map.set(member.memberId, member.displayName ?? member.memberId);
      }
    }
    return map;
  }, [teamGroups]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const summary = useMemo(() => {
    const totalTokens = agentStatuses.length > 0
      ? agentStatuses.reduce((sum, item) => sum + item.totalInputTokens + item.totalOutputTokens, 0)
      : store.tokenStats.reduce((sum, item) => sum + item.totalTokens, 0);
    const totalCost = agentStatuses.length > 0
      ? agentStatuses.reduce((sum, item) => sum + item.totalCost, 0)
      : store.tokenStats.reduce((sum, item) => sum + item.cost, 0);
    const activeAgents = agentStatuses.filter((agent) => statusIsActive(agentStatusValue(agent))).length;
    const totalAgents = agentStatuses.length;

    const teamMap = new Map<string, TeamCard>();
    for (const agent of agentStatuses) {
      const teamName = teamByMemberId.get(agent.agentId) ?? 'Unassigned';
      const current = teamMap.get(teamName) ?? {
        name: teamName,
        activeAgents: 0,
        totalAgents: 0,
        queuedTasks: 0,
        failedTasks: 0,
        spend: 0,
        health: 'healthy' as const,
      };
      current.totalAgents += 1;
      if (statusIsActive(agentStatusValue(agent))) current.activeAgents += 1;
      current.spend += agent.totalCost;
      current.queuedTasks += agent.activeTasks;
      if (agent.runtimeState === 'crashed' || agent.terminalStatus === 'error') {
        current.failedTasks += 1;
        current.health = 'warning';
      }
      teamMap.set(teamName, current);
    }

    const teams = [...teamMap.values()].sort((a, b) => b.spend - a.spend);
    const queuedTasks = teams.reduce((sum, team) => sum + team.queuedTasks, 0);
    const failedTasks = teams.reduce((sum, team) => sum + team.failedTasks, 0);
    const onlineNodes = nodes.filter((node) => node.status === 'online').length;

    return {
      totalTokens,
      totalCost,
      activeAgents,
      totalAgents,
      onlineNodes,
      totalNodes: nodes.length,
      queuedTasks,
      failedTasks,
      teams,
    };
  }, [agentStatuses, nodes, store.tokenStats, teamByMemberId]);

  const costChartKeys = useMemo(
    () => summary.teams.slice(0, chartColors.length).map((team) => ({ name: team.name, key: chartKeyForTeam(team.name) })),
    [summary.teams],
  );

  const costChartData = useMemo(() => {
    const row: Record<string, number | string> = { date: period };
    for (const team of summary.teams) {
      row[chartKeyForTeam(team.name)] = Number(team.spend.toFixed(2));
    }
    return [row];
  }, [period, summary.teams]);

  const recentActivity = useMemo(() => {
    const fromStatuses = agentStatuses.map((agent) => ({
      agentId: agent.agentId,
      terminalId: agent.terminalId,
      time: formatRelativeTime(agent.lastHeartbeat),
      agent: memberNameById.get(agent.agentId) ?? agent.agentId,
      action: agent.activeTasks > 0 ? 'task.running' : agent.terminalId ? 'terminal.ready' : 'agent.status',
      detail:
        agent.command ??
        agent.runtimeState ??
        `${(agent.totalInputTokens + agent.totalOutputTokens).toLocaleString()} tokens`,
      status: (agent.runtimeState === 'crashed' || agent.terminalStatus === 'error' ? 'warning' : 'success') as 'success' | 'warning',
    }));
    if (fromStatuses.length > 0) return fromStatuses.slice(0, 6);
    return store.activities.slice(0, 6).map((activity) => ({
      agentId: activity.memberId,
      terminalId: `term_${activity.memberId}`,
      time: '-',
      agent: activity.memberName,
      action: activity.currentTask ? 'llm.call' : 'token.event',
      detail: activity.currentTask ?? `Processed ${activity.tokenStats.totalTokens.toLocaleString()} tokens`,
      status: (activity.status.toLowerCase() === 'error' ? 'warning' : 'success') as 'success' | 'warning',
    }));
  }, [agentStatuses, memberNameById, store.activities]);

  const agents = useMemo(() => agentStatuses.map((agent) => ({
    id: agent.agentId,
    terminalId: agent.terminalId,
    name: memberNameById.get(agent.agentId) ?? agent.agentId,
    provider: agent.provider ?? agent.agentType ?? 'agent',
    team: teamByMemberId.get(agent.agentId) ?? 'Unassigned',
    node: agent.nodeHostname || nodeById.get(agent.nodeId)?.hostname || agent.nodeId || 'unassigned',
    status: statusIsActive(agentStatusValue(agent)) ? ('working' as const) : ('idle' as const),
    uptime: formatRelativeTime(agent.lastHeartbeat),
    tokens: agent.totalInputTokens + agent.totalOutputTokens,
    cost: `$${agent.totalCost.toFixed(2)}`,
  })), [agentStatuses, memberNameById, nodeById, teamByMemberId]);

  const nodeRows = useMemo(() => nodes.map((node) => {
    const load = node.assignedAgents.length || node.agentCount;
    return {
      id: node.id,
      hostname: node.hostname,
      type: node.nodeType === 'k8s_pod' ? 'K8s Pod' : 'Bare Metal',
      status: node.status,
      agents: node.maxAgents > 0 ? `${load}/${node.maxAgents}` : String(load),
      cpu: '-',
      memory: '-',
      network: '-',
    };
  }), [nodes]);

  const totalTokens = summary.totalTokens;
  const totalCost = summary.totalCost;
  const activeAgents = summary.activeAgents;
  const totalAgentCount = summary.totalAgents;
  const onlineNodes = summary.onlineNodes;
  const totalNodes = summary.totalNodes;
  const queuedTasks = summary.queuedTasks;
  const failedTasks = summary.failedTasks;
  const openTokens = () => navigate('ledger');
  const openAgents = () => navigate('members');
  const openNodes = () => navigate('nodes');
  const openTaskMap = () => navigate('taskmap');
  const openApprovals = () => navigate('approvals');
  const openTeam = () => navigate('members');
  const openAgent = (agentId: string, terminalId?: string | null) =>
    navigate('terminal', { hash: terminalHashForAgent(agentId, terminalId) });
  const openActivity = (activityItem: { agentId?: string; terminalId?: string | null; action: string }) => {
    if (activityItem.action.startsWith('terminal') || activityItem.action.startsWith('task') || activityItem.action === 'llm.call') {
      openAgent(activityItem.agentId ?? 'owner_1', activityItem.terminalId);
      return;
    }
    navigate('ledger');
  };

  return (
    <div className="h-full overflow-auto app-bg-canvas">
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold app-text-strong mb-1">Dashboard</h1>
            <p className="text-sm app-text-muted">Operations monitoring and platform health</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 app-surface-strong rounded-lg border app-border-subtle">
              {(['24h', '7d', '30d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    period === p
                      ? 'app-accent-bg text-white shadow-sm'
                      : 'app-text-muted hover:app-text-strong'
                  }`}
                  aria-pressed={period === p}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void store.loadDashboard();
                void loadRuntime();
              }}
              disabled={store.loadState === 'loading'}
            >
              <RefreshCw size={14} className="mr-1" />
              {store.loadState === 'loading' ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('ledger')}>
            <ChevronRight size={14} className="mr-1" />
            Ledger
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('nodes')}>
            <ChevronRight size={14} className="mr-1" />
            Nodes
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('members')}>
            <ChevronRight size={14} className="mr-1" />
            Team
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('approvals')}>
            <ChevronRight size={14} className="mr-1" />
            Approvals
          </Button>
        </div>

        {store.loadState === 'error' && (
          <div role="alert" className="mb-6 p-3 text-sm text-red-500 bg-red-900/20 rounded-md border border-red-500/30">
            {store.errorMessage ?? 'Dashboard failed to load.'}
          </div>
        )}
        {runtimeError && (
          <div role="alert" className="mb-6 p-3 text-sm text-orange-500 bg-orange-900/20 rounded-md border border-orange-500/30">
            {runtimeError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card
            className="p-4 hover:app-border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            role="button"
            tabIndex={0}
            aria-label="Open ledger token and cost events"
            onClick={openTokens}
            onKeyDown={(event) => handleActionKey(event, openTokens)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs app-text-faint font-semibold uppercase tracking-wider">
                Tokens &amp; Cost
              </div>
              <DollarSign size={16} className="app-text-muted" />
            </div>
            <div className="text-2xl font-bold app-text-strong mb-1">
              {totalTokens.toLocaleString()}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono app-text-strong">${totalCost.toFixed(2)}</span>
              <span className="text-xs app-text-muted">{period}</span>
            </div>
          </Card>

          <Card
            className="p-4 hover:app-border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            role="button"
            tabIndex={0}
            aria-label="Open team members and agent roster"
            onClick={openAgents}
            onKeyDown={(event) => handleActionKey(event, openAgents)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs app-text-faint font-semibold uppercase tracking-wider">
                Active Agents
              </div>
              <Zap size={16} className="app-accent-text" />
            </div>
            <div className="text-2xl font-bold app-text-strong mb-1">
              {activeAgents}/{totalAgentCount}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full app-accent-bg transition-all"
                  style={{ width: `${totalAgentCount ? (activeAgents / totalAgentCount) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs app-text-faint">
                {totalAgentCount ? Math.round((activeAgents / totalAgentCount) * 100) : 0}%
              </span>
            </div>
          </Card>

          <Card
            className="p-4 hover:app-border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            role="button"
            tabIndex={0}
            aria-label="Open execution nodes"
            onClick={openNodes}
            onKeyDown={(event) => handleActionKey(event, openNodes)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs app-text-faint font-semibold uppercase tracking-wider">
                Cluster Health
              </div>
              <Server size={16} className="text-green-600" />
            </div>
            <div className="text-2xl font-bold app-text-strong mb-1">
              {onlineNodes}/{totalNodes}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-green-600 border-green-600">
                {onlineNodes} Online
              </Badge>
              <Badge variant="outline" className="text-orange-500 border-orange-500">
                {Math.max(totalNodes - onlineNodes, 0)} Degraded
              </Badge>
            </div>
          </Card>

          <Card
            className="p-4 hover:app-border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            role="button"
            tabIndex={0}
            aria-label="Open task map queue"
            onClick={openTaskMap}
            onKeyDown={(event) => handleActionKey(event, openTaskMap)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs app-text-faint font-semibold uppercase tracking-wider">
                Task Queue
              </div>
              <Activity size={16} className="app-text-muted" />
            </div>
            <div className="text-2xl font-bold app-text-strong mb-1">{queuedTasks}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="app-text-muted">Queued</span>
              {failedTasks > 0 && (
                <>
                  <span className="app-text-faint">&bull;</span>
                  <span className="text-red-500">{failedTasks} Failed</span>
                </>
              )}
            </div>
          </Card>

          <Card
            className="p-4 hover:app-border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            role="button"
            tabIndex={0}
            aria-label="Open approvals"
            onClick={openApprovals}
            onKeyDown={(event) => handleActionKey(event, openApprovals)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs app-text-faint font-semibold uppercase tracking-wider">
                Approvals
              </div>
              <Shield size={16} className="text-orange-500" />
            </div>
            <div className="text-2xl font-bold app-text-strong mb-1">0</div>
            <div className="text-xs app-text-muted">Pending review</div>
          </Card>
        </div>

        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold app-text-strong">Cost by Team</h3>
            <div className="flex items-center gap-4 text-xs">
              {costChartKeys.map((item, index) => (
                <div key={item.key} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: chartColors[index] }} />
                  <span className="app-text-muted">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
          {costChartKeys.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={costChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
                  />
                  {costChartKeys.map((item, index) => (
                    <Area
                      key={item.key}
                      type="monotone"
                      dataKey={item.key}
                      name={item.name}
                      stackId="1"
                      stroke={chartColors[index]}
                      fill={chartColors[index]}
                      fillOpacity={0.6}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm app-text-muted">
              No agent cost data yet.
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold app-text-strong">Team Health Portfolio</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('members')}>
                View All
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
            <div className="space-y-3">
              {summary.teams.length > 0 ? summary.teams.map((team) => (
                <div
                  key={team.name}
                  className="p-4 app-surface-strong rounded-lg border app-border-subtle hover:app-border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open team roster for ${team.name}`}
                  onClick={openTeam}
                  onKeyDown={(event) => handleActionKey(event, openTeam)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="font-medium app-text-strong text-sm">{team.name}</div>
                      {team.health === 'healthy' ? (
                        <CheckCircle size={14} className="text-green-600" />
                      ) : (
                        <AlertCircle size={14} className="text-orange-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs app-text-muted">
                      <span>
                        {team.activeAgents}/{team.totalAgents} active
                      </span>
                      <span className="font-mono font-semibold app-text-strong">
                        ${team.spend.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs app-text-faint">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {team.queuedTasks} queued
                    </span>
                    {team.failedTasks > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertCircle size={12} />
                        {team.failedTasks} failed
                      </span>
                    )}
                  </div>
                </div>
              )) : (
                <div className="p-4 app-surface-strong rounded-lg border app-border-subtle text-sm app-text-muted">
                  No AI Assistant team data yet.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold app-text-strong">Agent Status</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('terminal')}>
                View Sessions
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {agents.length > 0 ? agents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-3 app-surface-strong rounded-lg border app-border-subtle hover:app-border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open terminal session for ${agent.name}`}
                  onClick={() => openAgent(agent.id, agent.terminalId)}
                  onKeyDown={(event) => handleActionKey(event, () => openAgent(agent.id, agent.terminalId))}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          agent.status === 'working'
                            ? 'bg-green-500 animate-pulse'
                            : 'bg-gray-400'
                        }`}
                      />
                      <span className="font-medium app-text-strong text-sm">{agent.name}</span>
                      <Badge variant="outline" className="text-[10px] py-0">
                        {agent.provider}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Terminal size={12} className="app-text-muted" />
                      <span className="app-text-faint">{agent.uptime}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs app-text-muted">
                    <div className="flex items-center gap-3">
                      <span>{agent.team}</span>
                      <span className="app-text-faint">&bull;</span>
                      <span className="font-mono">{agent.node}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="app-text-faint">
                        {agent.tokens.toLocaleString()} tokens
                      </span>
                      <span className="font-mono font-semibold app-text-strong">
                        {agent.cost}
                      </span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-4 app-surface-strong rounded-lg border app-border-subtle text-sm app-text-muted">
                  No AI Assistant runtimes registered.
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold app-text-strong">Node Fleet Summary</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('nodes')}>
              Manage Nodes
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Agents</TableHead>
                <TableHead className="text-right">CPU</TableHead>
                <TableHead className="text-right">Memory</TableHead>
                <TableHead className="text-right">Network</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodeRows.length > 0 ? nodeRows.map((node) => (
                <TableRow
                  key={node.id}
                  className="cursor-pointer hover:app-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open node ${node.hostname}`}
                  onClick={openNodes}
                  onKeyDown={(event) => handleActionKey(event, openNodes)}
                >
                  <TableCell className="font-medium font-mono text-sm">
                    {node.hostname}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {node.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        node.status === 'online'
                          ? 'text-green-600 border-green-600'
                          : 'text-orange-500 border-orange-500'
                      }
                    >
                      {node.status === 'online' ? (
                        <CheckCircle size={12} className="mr-1" />
                      ) : (
                        <AlertCircle size={12} className="mr-1" />
                      )}
                      {node.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{node.agents}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Cpu size={12} className="app-text-muted" />
                      <span className="font-mono text-sm">{node.cpu}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <HardDrive size={12} className="app-text-muted" />
                      <span className="font-mono text-sm">{node.memory}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <NetworkIcon size={12} className="app-text-muted" />
                      <span className="font-mono text-sm">{node.network}</span>
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm app-text-muted py-8">
                    No execution nodes registered.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold app-text-strong">Recent Agent Activity</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('ledger')}>
              View Ledger
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentActivity.length > 0 ? recentActivity.map((activityItem) => (
                <TableRow
                  key={`${activityItem.time}-${activityItem.agent}-${activityItem.action}`}
                  className="cursor-pointer hover:app-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${activityItem.agent} activity`}
                  onClick={() => openActivity(activityItem)}
                  onKeyDown={(event) => handleActionKey(event, () => openActivity(activityItem))}
                >
                  <TableCell className="font-mono text-sm app-text-faint">
                    {activityItem.time}
                  </TableCell>
                  <TableCell className="font-medium">{activityItem.agent}</TableCell>
                  <TableCell className="font-mono text-sm app-text-muted">
                    {activityItem.action}
                  </TableCell>
                  <TableCell className="app-text-muted text-sm">{activityItem.detail}</TableCell>
                  <TableCell>
                    {activityItem.status === 'success' ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle size={12} className="mr-1" />
                        Success
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-500 border-orange-500">
                        <AlertCircle size={12} className="mr-1" />
                        Warning
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm app-text-muted py-8">
                    No recent agent activity.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};
