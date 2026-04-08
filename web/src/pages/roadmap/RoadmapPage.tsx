/**
 * RoadmapPage -- Agent Observability dashboard with traces, metrics, and agent views.
 * Retains existing API calls for roadmap + project data, augmented with
 * observability presentation matching the Figma prototype.
 */

import React, { useState } from 'react';
import {
  Activity,
  Zap,
  DollarSign,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  GitBranch,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Terminal,
  MessageSquare,
  Code,
  Settings,
  Eye,
  Play,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
// API client retained for future integration with real trace data
// import { useAppShell } from '@/state/app-shell-store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ── Types ── */

interface Trace {
  id: string;
  name: string;
  agent: string;
  status: 'success' | 'error' | 'running';
  duration: number;
  tokens: number;
  cost: number;
  timestamp: string;
  tags: string[];
  input?: string;
  output?: string;
  error?: string;
}

interface MetricsData {
  timestamp: string;
  requests: number;
  tokens: number;
  latency: number;
  errors: number;
  cost: number;
}

/* ── Mock data ── */

const mockTraces: Trace[] = [
  {
    id: 'trace-001',
    name: 'code_review',
    agent: 'Claude BE',
    status: 'success',
    duration: 3450,
    tokens: 2341,
    cost: 0.0234,
    timestamp: '2026-04-08 14:32:45',
    tags: ['backend', 'review'],
    input: 'Review the authentication middleware implementation',
    output: 'Code review completed. Found 2 issues...',
  },
  {
    id: 'trace-002',
    name: 'ui_generation',
    agent: 'Gemini FE',
    status: 'success',
    duration: 2890,
    tokens: 1876,
    cost: 0.0156,
    timestamp: '2026-04-08 14:31:20',
    tags: ['frontend', 'generation'],
  },
  {
    id: 'trace-003',
    name: 'test_generation',
    agent: 'GPT-4 QA',
    status: 'error',
    duration: 5230,
    tokens: 3421,
    cost: 0.0342,
    timestamp: '2026-04-08 14:29:15',
    tags: ['qa', 'testing'],
    error: 'Token limit exceeded',
  },
  {
    id: 'trace-004',
    name: 'api_optimization',
    agent: 'Claude BE',
    status: 'success',
    duration: 4120,
    tokens: 2987,
    cost: 0.0299,
    timestamp: '2026-04-08 14:25:30',
    tags: ['backend', 'optimization'],
  },
  {
    id: 'trace-005',
    name: 'deployment_check',
    agent: 'Codex DevOps',
    status: 'running',
    duration: 1200,
    tokens: 450,
    cost: 0.0045,
    timestamp: '2026-04-08 14:33:10',
    tags: ['devops', 'deploy'],
  },
];

const mockMetrics: MetricsData[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp: `${String(i).padStart(2, '0')}:00`,
  requests: Math.floor(Math.random() * 50 + 20),
  tokens: Math.floor(Math.random() * 5000 + 1000),
  latency: Math.floor(Math.random() * 2000 + 1000),
  errors: Math.floor(Math.random() * 3),
  cost: Math.random() * 0.5 + 0.1,
}));

const agentUsage = [
  { name: 'Claude BE', value: 3245, color: '#8b5cf6' },
  { name: 'Gemini FE', value: 2876, color: '#06b6d4' },
  { name: 'GPT-4 QA', value: 1983, color: '#10b981' },
  { name: 'Codex DevOps', value: 1543, color: '#f59e0b' },
];

/* ── Page component ── */

export const RoadmapPage = () => {
  const [selectedView, setSelectedView] = useState<'traces' | 'metrics' | 'agents'>('traces');
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('24h');

  // Calculate stats
  const totalTraces = mockTraces.length;
  const successTraces = mockTraces.filter((tr) => tr.status === 'success').length;
  const successRate = Math.round((successTraces / totalTraces) * 100);
  const totalTokens = mockTraces.reduce((sum, tr) => sum + tr.tokens, 0);
  const totalCost = mockTraces.reduce((sum, tr) => sum + tr.cost, 0);
  const avgLatency = Math.round(
    mockTraces.reduce((sum, tr) => sum + tr.duration, 0) / totalTraces,
  );
  const previousSuccessRate = 92;

  const getStatusBadge = (status: Trace['status']) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300">
            Success
          </Badge>
        );
      case 'error':
        return (
          <Badge className="bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300">
            Error
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300">
            Running
          </Badge>
        );
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header with Metrics */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold app-text-strong">Agent Observability</h1>
            </div>
            {/* Inline Metrics */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Activity size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{totalTraces}</span>
                <span className="app-text-faint">traces</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-600" />
                <span className="font-semibold text-green-600">{successRate}%</span>
                <span className="app-text-faint">success</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Zap size={14} className="app-accent-text" />
                <span className="font-semibold app-text-strong">
                  {totalTokens.toLocaleString()}
                </span>
                <span className="app-text-faint">tokens</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <DollarSign size={14} className="text-orange-600" />
                <span className="font-semibold text-orange-600">${totalCost.toFixed(3)}</span>
                <span className="app-text-faint">cost</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{avgLatency}ms</span>
                <span className="app-text-faint">avg</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="h-8 px-3 text-xs border app-border-subtle rounded-lg app-bg-surface app-text-strong"
            >
              <option value="1h">Last hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <Button variant="outline" size="sm" className="h-8">
              <RefreshCw size={14} className="mr-1" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-8">
              <Settings size={14} className="mr-1" />
              Configure
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-2">
        <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as typeof selectedView)}>
          <TabsList>
            <TabsTrigger value="traces" className="gap-2">
              <GitBranch size={14} />
              Traces
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2">
              <BarChart3 size={14} />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2">
              <Zap size={14} />
              Agents
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {selectedView === 'traces' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint"
                />
                <Input
                  placeholder="Search traces by name, agent, or tag..."
                  className="pl-9 h-9"
                />
              </div>
              <Button variant="outline" size="sm" className="h-9">
                <Filter size={14} className="mr-1" />
                Filters
              </Button>
            </div>

            {/* Traces Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableHead className="w-10" />
                    <TableHead className="w-[140px]">Timestamp</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[140px]">Agent</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[100px] text-right">Duration</TableHead>
                    <TableHead className="w-[100px] text-right">Tokens</TableHead>
                    <TableHead className="w-[100px] text-right">Cost</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockTraces.map((trace) => {
                    const isExpanded = expandedTrace === trace.id;
                    return (
                      <React.Fragment key={trace.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          onClick={() => setExpandedTrace(isExpanded ? null : trace.id)}
                        >
                          <TableCell>
                            <button className="app-text-muted hover:app-text-strong">
                              {isExpanded ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-xs app-text-faint">
                            {trace.timestamp}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Code size={14} className="app-text-muted" />
                              <span className="font-mono text-sm app-text-strong">
                                {trace.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              {trace.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-[9px] font-bold">
                                {trace.agent.charAt(0)}
                              </div>
                              <span className="text-sm app-text-strong">{trace.agent}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(trace.status)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {trace.duration}ms
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {trace.tokens.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-orange-600">
                            ${trace.cost.toFixed(4)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Eye size={14} />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell
                              colSpan={9}
                              className="bg-gray-50 dark:bg-gray-900/50 p-0"
                            >
                              <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  {trace.input && (
                                    <Card className="p-4">
                                      <div className="flex items-center gap-2 mb-3">
                                        <MessageSquare size={14} className="app-accent-text" />
                                        <span className="text-xs font-semibold app-text-strong uppercase tracking-wider">
                                          Input
                                        </span>
                                      </div>
                                      <pre className="text-xs app-text-muted whitespace-pre-wrap">
                                        {trace.input}
                                      </pre>
                                    </Card>
                                  )}

                                  {trace.output && (
                                    <Card className="p-4">
                                      <div className="flex items-center gap-2 mb-3">
                                        <Terminal size={14} className="text-green-600" />
                                        <span className="text-xs font-semibold app-text-strong uppercase tracking-wider">
                                          Output
                                        </span>
                                      </div>
                                      <pre className="text-xs app-text-muted whitespace-pre-wrap">
                                        {trace.output}
                                      </pre>
                                    </Card>
                                  )}

                                  {trace.error && (
                                    <Card className="p-4 border-red-200 dark:border-red-900">
                                      <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle size={14} className="text-red-600" />
                                        <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
                                          Error
                                        </span>
                                      </div>
                                      <pre className="text-xs text-red-600 whitespace-pre-wrap">
                                        {trace.error}
                                      </pre>
                                    </Card>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 pt-2 border-t app-border-subtle">
                                  <Button variant="outline" size="sm">
                                    <Play size={14} className="mr-1" />
                                    Replay
                                  </Button>
                                  <Button variant="outline" size="sm">
                                    <RotateCcw size={14} className="mr-1" />
                                    Retry
                                  </Button>
                                  <Button variant="outline" size="sm">
                                    <ExternalLink size={14} className="mr-1" />
                                    View Full Trace
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
          </div>
        )}

        {selectedView === 'metrics' && (
          <div className="space-y-6">
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs app-text-faint uppercase tracking-wider">
                    Success Rate
                  </span>
                  {successRate > previousSuccessRate ? (
                    <TrendingUp size={14} className="text-green-600" />
                  ) : (
                    <TrendingDown size={14} className="text-red-600" />
                  )}
                </div>
                <div className="text-2xl font-bold app-text-strong mb-1">{successRate}%</div>
                <Progress value={successRate} className="h-1.5" />
                <div className="text-xs app-text-faint mt-2">
                  {successRate > previousSuccessRate ? '+' : ''}
                  {successRate - previousSuccessRate}% vs previous period
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs app-text-faint uppercase tracking-wider">
                    Total Tokens
                  </span>
                  <Zap size={14} className="app-accent-text" />
                </div>
                <div className="text-2xl font-bold app-text-strong mb-1">
                  {totalTokens.toLocaleString()}
                </div>
                <div className="text-xs app-text-faint mt-2">Last {timeRange}</div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs app-text-faint uppercase tracking-wider">
                    Total Cost
                  </span>
                  <DollarSign size={14} className="text-orange-600" />
                </div>
                <div className="text-2xl font-bold text-orange-600 mb-1">
                  ${totalCost.toFixed(2)}
                </div>
                <div className="text-xs app-text-faint mt-2">Last {timeRange}</div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs app-text-faint uppercase tracking-wider">
                    Avg Latency
                  </span>
                  <Clock size={14} className="app-text-muted" />
                </div>
                <div className="text-2xl font-bold app-text-strong mb-1">{avgLatency}ms</div>
                <div className="text-xs app-text-faint mt-2">P50 latency</div>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="text-sm font-semibold app-text-strong mb-4">Token Usage</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mockMetrics}>
                    <defs>
                      <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3ecfae" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3ecfae" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      stroke="#3ecfae"
                      fillOpacity={1}
                      fill="url(#colorTokens)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold app-text-strong mb-4">Latency (ms)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={mockMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="latency"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold app-text-strong mb-4">Request Volume</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={mockMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="requests" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold app-text-strong mb-4">Errors Over Time</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mockMetrics}>
                    <defs>
                      <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="errors"
                      stroke="#ef4444"
                      fillOpacity={1}
                      fill="url(#colorErrors)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        {selectedView === 'agents' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {/* Agent Usage Distribution */}
              <Card className="p-4 col-span-1">
                <h3 className="text-sm font-semibold app-text-strong mb-4">
                  Token Distribution
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={agentUsage}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {agentUsage.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-4">
                  {agentUsage.map((agent) => (
                    <div
                      key={agent.name}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: agent.color }}
                        />
                        <span className="app-text-strong">{agent.name}</span>
                      </div>
                      <span className="app-text-faint">{agent.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Agent Performance */}
              <Card className="p-4 col-span-2">
                <h3 className="text-sm font-semibold app-text-strong mb-4">
                  Agent Performance
                </h3>
                <div className="space-y-3">
                  {[
                    { name: 'Claude BE', avg: 3450, success: 98, tokens: 2341 },
                    { name: 'Gemini FE', avg: 2890, success: 96, tokens: 1876 },
                    { name: 'GPT-4 QA', avg: 5230, success: 87, tokens: 3421 },
                    { name: 'Codex DevOps', avg: 1200, success: 100, tokens: 450 },
                  ].map((agent) => (
                    <div key={agent.name} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold app-text-strong">
                            {agent.name}
                          </span>
                          <span className="text-xs app-text-faint">
                            {agent.success}% success
                          </span>
                        </div>
                        <Progress value={agent.success} className="h-1.5" />
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono app-text-strong">{agent.avg}ms</div>
                        <div className="text-[10px] app-text-faint">avg</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono app-text-strong">{agent.tokens}</div>
                        <div className="text-[10px] app-text-faint">tokens</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
