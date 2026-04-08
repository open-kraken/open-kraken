import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  TrendingUp,
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
import { useAppShell } from '@/state/app-shell-store';
import { useDashboardStore } from '@/state/dashboardStore';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PeriodOption = '24h' | '7d' | '30d';

type TeamCard = {
  name: string;
  activeAgents: number;
  totalAgents: number;
  queuedTasks: number;
  failedTasks: number;
  spend: number;
  trend: string;
  health: 'healthy' | 'warning';
};

// ---------------------------------------------------------------------------
// Fallback / mock data
// ---------------------------------------------------------------------------

const fallbackTokenStats = [
  { memberId: 'agent_claude_be', memberName: 'Claude BE', nodeId: 'k8s-alpha-01', inputTokens: 182300, outputTokens: 274489, totalTokens: 456789, cost: 12.45, period: '7d' },
  { memberId: 'agent_gemini_fe', memberName: 'Gemini FE', nodeId: 'k8s-alpha-02', inputTokens: 102400, outputTokens: 132167, totalTokens: 234567, cost: 8.23, period: '7d' },
  { memberId: 'agent_gpt4_qa', memberName: 'GPT-4 QA', nodeId: 'k8s-beta-01', inputTokens: 53412, outputTokens: 70044, totalTokens: 123456, cost: 5.67, period: '7d' },
  { memberId: 'agent_claude_reviewer', memberName: 'Claude Reviewer', nodeId: 'k8s-alpha-01', inputTokens: 126000, outputTokens: 219678, totalTokens: 345678, cost: 9.87, period: '7d' },
  { memberId: 'agent_qwen_api', memberName: 'Qwen API', nodeId: 'bare-metal-01', inputTokens: 231000, outputTokens: 336890, totalTokens: 567890, cost: 4.32, period: '7d' },
  { memberId: 'agent_shell_ops', memberName: 'Shell Ops', nodeId: 'bare-metal-02', inputTokens: 35400, outputTokens: 63365, totalTokens: 98765, cost: 2.11, period: '7d' },
];

const fallbackActivities = fallbackTokenStats.map((item, index) => ({
  memberId: item.memberId,
  memberName: item.memberName,
  status: index === 2 || index === 5 ? 'idle' : 'working',
  currentTask: [
    'Review auth middleware migration',
    'Polish dashboard visual parity',
    'Run E2E smoke suite',
    'Code review analysis',
    'Optimize API relay path',
    'Prepare staging deploy checklist',
  ][index],
  tokenStats: item,
}));

const costChartData = [
  { date: 'Day 1', backend: 12, frontend: 8, qa: 4, devops: 3 },
  { date: 'Day 2', backend: 15, frontend: 10, qa: 5, devops: 4 },
  { date: 'Day 3', backend: 18, frontend: 12, qa: 6, devops: 5 },
  { date: 'Day 4', backend: 14, frontend: 11, qa: 5, devops: 4 },
  { date: 'Day 5', backend: 20, frontend: 14, qa: 7, devops: 6 },
  { date: 'Day 6', backend: 22, frontend: 15, qa: 8, devops: 7 },
  { date: 'Day 7', backend: 25, frontend: 18, qa: 9, devops: 8 },
];

const mockAgents = [
  { name: 'Claude BE', provider: 'Anthropic', team: 'Backend Squad', node: 'k8s-alpha-01', status: 'working' as const, uptime: '12h 34m', tokens: 456789, cost: '$12.45' },
  { name: 'Gemini FE', provider: 'Google', team: 'Frontend Squad', node: 'k8s-alpha-02', status: 'working' as const, uptime: '8h 12m', tokens: 234567, cost: '$8.23' },
  { name: 'GPT-4 QA', provider: 'OpenAI', team: 'QA Squad', node: 'k8s-beta-01', status: 'idle' as const, uptime: '15h 45m', tokens: 123456, cost: '$5.67' },
  { name: 'Claude Reviewer', provider: 'Anthropic', team: 'Backend Squad', node: 'k8s-alpha-01', status: 'working' as const, uptime: '6h 23m', tokens: 345678, cost: '$9.87' },
  { name: 'Qwen API', provider: 'Alibaba', team: 'Backend Squad', node: 'bare-metal-01', status: 'working' as const, uptime: '18h 56m', tokens: 567890, cost: '$4.32' },
  { name: 'Shell Ops', provider: 'Gemini', team: 'DevOps Squad', node: 'bare-metal-02', status: 'idle' as const, uptime: '3h 12m', tokens: 98765, cost: '$2.11' },
];

const mockNodes = [
  { hostname: 'k8s-alpha-01', type: 'K8s Pod', status: 'online' as const, agents: 2, cpu: '45%', memory: '62%', network: '12MB/s' },
  { hostname: 'k8s-alpha-02', type: 'K8s Pod', status: 'online' as const, agents: 1, cpu: '32%', memory: '48%', network: '8MB/s' },
  { hostname: 'k8s-beta-01', type: 'K8s Pod', status: 'online' as const, agents: 1, cpu: '28%', memory: '41%', network: '5MB/s' },
  { hostname: 'bare-metal-01', type: 'Bare Metal', status: 'online' as const, agents: 1, cpu: '18%', memory: '35%', network: '15MB/s' },
  { hostname: 'bare-metal-02', type: 'Bare Metal', status: 'degraded' as const, agents: 1, cpu: '78%', memory: '85%', network: '22MB/s' },
];

const mockRecentActivity = [
  { time: '2m ago', agent: 'Claude BE', action: 'terminal.exec', detail: 'npm run build', status: 'success' as const },
  { time: '5m ago', agent: 'Gemini FE', action: 'git.commit', detail: 'Update dashboard UI', status: 'success' as const },
  { time: '8m ago', agent: 'GPT-4 QA', action: 'test.run', detail: 'E2E test suite', status: 'success' as const },
  { time: '12m ago', agent: 'Claude Reviewer', action: 'llm.call', detail: 'Code review analysis', status: 'success' as const },
  { time: '15m ago', agent: 'Qwen API', action: 'terminal.exec', detail: 'cargo test', status: 'warning' as const },
  { time: '18m ago', agent: 'Shell Ops', action: 'deploy.staging', detail: 'Deploy v2.3.1', status: 'success' as const },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inferredTeamName = (memberName: string) => {
  const lower = memberName.toLowerCase();
  if (lower.includes('frontend') || lower.includes('fe') || lower.includes('ui')) return 'Frontend Squad';
  if (lower.includes('qa') || lower.includes('test')) return 'QA Squad';
  if (lower.includes('ops') || lower.includes('infra') || lower.includes('devops')) return 'DevOps Squad';
  return 'Backend Squad';
};

const statusIsActive = (status: string) =>
  ['running', 'working', 'busy', 'in_progress', 'online'].includes(status.toLowerCase());

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DashboardPage = () => {
  const { navigate } = useAppShell();
  const store = useDashboardStore();
  const [period, setPeriod] = useState<PeriodOption>('7d');

  useEffect(() => {
    void store.loadDashboard();
  }, [store.loadDashboard]);

  const tokenStats = store.tokenStats.length > 1 ? store.tokenStats : fallbackTokenStats;
  const activities = store.activities.length > 1 ? store.activities : fallbackActivities;

  // ── Derived summary ──

  const summary = useMemo(() => {
    const totalTokens = tokenStats.reduce((sum, item) => sum + item.totalTokens, 0);
    const totalCost = tokenStats.reduce((sum, item) => sum + item.cost, 0);
    const activeAgents = activities.filter((item) => statusIsActive(item.status)).length;
    const totalAgents = Math.max(activities.length, tokenStats.length);

    const teamMap = new Map<string, TeamCard>();
    for (const activity of activities) {
      const teamName = inferredTeamName(activity.memberName);
      const current = teamMap.get(teamName) ?? {
        name: teamName,
        activeAgents: 0,
        totalAgents: 0,
        queuedTasks: 0,
        failedTasks: 0,
        spend: 0,
        trend: '+8%',
        health: 'healthy' as const,
      };
      current.totalAgents += 1;
      if (statusIsActive(activity.status)) current.activeAgents += 1;
      current.spend += activity.tokenStats.cost;
      current.queuedTasks += Math.max(1, Math.round(activity.tokenStats.totalTokens / 120000));
      if (activity.status.toLowerCase() === 'error') {
        current.failedTasks += 1;
        current.health = 'warning';
      }
      teamMap.set(teamName, current);
    }

    const teams = [...teamMap.values()].sort((a, b) => b.spend - a.spend);
    const queuedTasks = teams.reduce((sum, team) => sum + team.queuedTasks, 0);
    const failedTasks = teams.reduce((sum, team) => sum + team.failedTasks, 0);
    const onlineNodes = new Set(tokenStats.map((item) => item.nodeId).filter(Boolean)).size;

    return { totalTokens, totalCost, activeAgents, totalAgents, onlineNodes, totalNodes: Math.max(onlineNodes + 1, 3), queuedTasks, failedTasks, teams };
  }, [activities, tokenStats]);

  const recentActivity = useMemo(() => {
    if (activities === fallbackActivities) return mockRecentActivity;
    return activities.slice(0, 6).map((activity, index) => ({
      time: `${2 + index * 3}m ago`,
      agent: activity.memberName,
      action: activity.currentTask ? 'llm.call' : 'terminal.exec',
      detail: activity.currentTask ?? `Processed ${activity.tokenStats.totalTokens.toLocaleString()} tokens`,
      status: (activity.status.toLowerCase() === 'error' ? 'warning' : 'success') as 'success' | 'warning',
    }));
  }, [activities]);

  const agents = useMemo(() => {
    if (activities === fallbackActivities) return mockAgents;
    return activities.map((a) => ({
      name: a.memberName,
      provider: 'Agent',
      team: inferredTeamName(a.memberName),
      node: a.tokenStats.nodeId ?? 'unassigned',
      status: statusIsActive(a.status) ? ('working' as const) : ('idle' as const),
      uptime: '-',
      tokens: a.tokenStats.totalTokens,
      cost: `$${a.tokenStats.cost.toFixed(2)}`,
    }));
  }, [activities]);

  const nodes = mockNodes;

  const totalTokens = summary.totalTokens;
  const totalCost = summary.totalCost;
  const activeAgents = summary.activeAgents;
  const totalAgentCount = summary.totalAgents;
  const onlineNodes = summary.onlineNodes;
  const totalNodes = summary.totalNodes;
  const queuedTasks = summary.queuedTasks;
  const failedTasks = summary.failedTasks;

  return (
    <div className="h-full overflow-auto app-bg-canvas">
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold app-text-strong mb-1">Dashboard</h1>
            <p className="text-sm app-text-muted">Operations monitoring and platform health</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period Selector */}
            <div className="flex gap-1 p-1 app-surface-strong rounded-lg border app-border-subtle">
              {(['24h', '7d', '30d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    period === p
                      ? 'app-accent-bg app-accent-text'
                      : 'app-text-muted hover:app-text-strong'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void store.loadDashboard()}
              disabled={store.loadState === 'loading'}
            >
              <RefreshCw size={14} className="mr-1" />
              {store.loadState === 'loading' ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Quick Links */}
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

        {/* Error state */}
        {store.loadState === 'error' && (
          <div role="alert" className="mb-6 p-3 text-sm text-red-500 bg-red-900/20 rounded-md border border-red-500/30">
            {store.errorMessage ?? 'Dashboard failed to load.'}
          </div>
        )}

        {/* Top Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {/* Tokens & Cost */}
          <Card className="p-4 hover:app-border-accent transition-colors cursor-pointer">
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
              <div className="flex items-center gap-1 text-xs text-green-600">
                <TrendingUp size={12} />
                <span>+12%</span>
              </div>
            </div>
          </Card>

          {/* Active Agents */}
          <Card className="p-4 hover:app-border-accent transition-colors cursor-pointer">
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

          {/* Cluster Health */}
          <Card className="p-4 hover:app-border-accent transition-colors cursor-pointer">
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

          {/* Task Queue */}
          <Card className="p-4 hover:app-border-accent transition-colors cursor-pointer">
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

          {/* Approvals */}
          <Card className="p-4 hover:app-border-accent transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs app-text-faint font-semibold uppercase tracking-wider">
                Approvals
              </div>
              <Shield size={16} className="text-orange-500" />
            </div>
            <div className="text-2xl font-bold app-text-strong mb-1">3</div>
            <div className="text-xs app-text-muted">Pending review</div>
          </Card>
        </div>

        {/* Cost Timeline Chart */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold app-text-strong">Cost Timeline by Team</h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="app-text-muted">Backend</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="app-text-muted">Frontend</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="app-text-muted">QA</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="app-text-muted">DevOps</span>
              </div>
            </div>
          </div>
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
                  formatter={(value) => [`$${value}`, '']}
                />
                <Area
                  key="backend-area"
                  type="monotone"
                  dataKey="backend"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                />
                <Area
                  key="frontend-area"
                  type="monotone"
                  dataKey="frontend"
                  stackId="1"
                  stroke="#a855f7"
                  fill="#a855f7"
                  fillOpacity={0.6}
                />
                <Area
                  key="qa-area"
                  type="monotone"
                  dataKey="qa"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.6}
                />
                <Area
                  key="devops-area"
                  type="monotone"
                  dataKey="devops"
                  stackId="1"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Team Health & Agent Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Team Health Portfolio */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold app-text-strong">Team Health Portfolio</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('members')}>
                View All
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
            <div className="space-y-3">
              {summary.teams.map((team) => (
                <div
                  key={team.name}
                  className="p-4 app-surface-strong rounded-lg border app-border-subtle hover:app-border-accent transition-colors cursor-pointer"
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
                      <span className="text-green-600">{team.trend}</span>
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
              ))}
            </div>
          </Card>

          {/* Agent Status List */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold app-text-strong">Agent Status</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('terminal')}>
                View Sessions
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="p-3 app-surface-strong rounded-lg border app-border-subtle hover:app-border-accent transition-colors cursor-pointer"
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
              ))}
            </div>
          </Card>
        </div>

        {/* Node Fleet Summary */}
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
              {nodes.map((node) => (
                <TableRow key={node.hostname} className="cursor-pointer hover:app-surface-hover">
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
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Recent Agent Activity */}
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
              {recentActivity.map((activity, idx) => (
                <TableRow key={idx} className="cursor-pointer hover:app-surface-hover">
                  <TableCell className="font-mono text-sm app-text-faint">
                    {activity.time}
                  </TableCell>
                  <TableCell className="font-medium">{activity.agent}</TableCell>
                  <TableCell className="font-mono text-sm app-text-muted">
                    {activity.action}
                  </TableCell>
                  <TableCell className="app-text-muted text-sm">{activity.detail}</TableCell>
                  <TableCell>
                    {activity.status === 'success' ? (
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
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};
