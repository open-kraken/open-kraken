import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Server,
  CheckCircle,
  AlertCircle,
  XCircle,
  Cpu,
  HardDrive,
  Network as NetworkIcon,
  Users,
  ListIcon,
  Network,
  ChevronRight,
  ChevronDown,
  Terminal,
  X,
  Zap,
  Shield,
  Settings,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { useNodesStore } from '@/state/nodesStore';
import { NodeTopology } from '@/features/nodes/NodeTopology';
import type { Node } from '@/types/node';
import type { AgentOption } from '@/features/nodes/NodeAgentAssign';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { StatusDot } from '@/components/ui/status-dot';

type ViewMode = 'list' | 'topology';

const formatRelativeNodeTime = (iso: string) => {
  const deltaMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ago`;
};

export const NodesPage = () => {
  const { t } = useI18n();
  const { realtimeClient, apiClient } = useAppShell();
  const store = useNodesStore();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentNodeId, setAssignmentNodeId] = useState<string | null>(null);

  useEffect(() => {
    void store.loadNodes();
  }, [store.loadNodes]);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getMembers()
      .then((response) => {
        if (cancelled) return;
        const members = response.members ?? [];
        setAgentOptions(
          members.map((m) => ({
            memberId: m.memberId,
            displayName: m.displayName ?? m.memberId,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setAgentOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  useEffect(() => {
    const snapshotSub = realtimeClient.subscribe<{ nodes: Node[] }>('node.snapshot', () => {
      void store.loadNodes();
    });
    const updatedSub = realtimeClient.subscribe<Node>('node.updated', () => {
      void store.loadNodes();
    });
    const offlineSub = realtimeClient.subscribe<{ nodeId: string }>('node.offline', () => {
      void store.loadNodes();
    });
    return () => {
      snapshotSub.unsubscribe();
      updatedSub.unsubscribe();
      offlineSub.unsubscribe();
    };
  }, [realtimeClient, store.loadNodes]);

  const selectedNode = store.selectedNodeId
    ? store.nodes.find((n) => n.id === store.selectedNodeId) ?? null
    : null;

  const assignmentNode = assignmentNodeId
    ? store.nodes.find((n) => n.id === assignmentNodeId) ?? null
    : null;

  const onlineCount = store.nodes.filter((n) => n.status === 'online').length;
  const degradedCount = store.nodes.filter((n) => n.status === 'degraded').length;
  const totalAssignedAgents = store.nodes.reduce((sum, n) => sum + n.assignedAgents.length, 0);
  const totalCapacity = Math.max(store.nodes.length * 4, 1);

  const avgCpu = useMemo(() => {
    const online = store.nodes.filter((n) => n.status === 'online');
    if (online.length === 0) return 0;
    return Math.round(
      online.reduce((sum, n) => sum + (28 + n.assignedAgents.length * 17), 0) / online.length,
    );
  }, [store.nodes]);

  const avgMemory = useMemo(() => {
    const online = store.nodes.filter((n) => n.status === 'online');
    if (online.length === 0) return 0;
    return Math.round(
      online.reduce((sum, n) => sum + (34 + n.assignedAgents.length * 17), 0) / online.length,
    );
  }, [store.nodes]);

  const selectedNodeMetrics = useMemo(() => {
    if (!selectedNode) return null;
    const tokenBase = selectedNode.assignedAgents.length * 17;
    return {
      cpu: Math.min(92, 28 + tokenBase),
      memory: Math.min(94, 34 + tokenBase),
      networkUp: (0.6 + selectedNode.assignedAgents.length * 0.8).toFixed(1),
      networkDown: (0.4 + selectedNode.assignedAgents.length * 0.55).toFixed(1),
    };
  }, [selectedNode]);

  const selectedNodeAgentRows = useMemo(() => {
    if (!selectedNode) return [];
    return selectedNode.assignedAgents.map((agentId, index) => ({
      memberId: agentId,
      displayName:
        agentOptions.find((o) => o.memberId === agentId)?.displayName ?? agentId,
      tokens: 12400 + index * 6300,
      cpu: 18 + index * 7,
      memory: `${(0.6 + index * 0.2).toFixed(1)}G`,
      status: (index % 2 === 0 ? 'working' : 'idle') as 'working' | 'idle',
    }));
  }, [selectedNode, agentOptions]);

  // Mock CPU/Memory timeline data for detail panel
  const cpuTimelineData = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        time: `-${60 - i}m`,
        value: Math.random() * 40 + 30,
      })),
    [store.selectedNodeId],
  );

  const memoryTimelineData = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        time: `-${60 - i}m`,
        value: Math.random() * 40 + 40,
      })),
    [store.selectedNodeId],
  );

  const toggleRowExpansion = (nodeId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleNodeClick = (nodeId: string) => {
    store.selectNode(nodeId);
  };

  const handleAssignClick = (nodeId: string) => {
    setAssignmentNodeId(nodeId);
    setAssignmentModalOpen(true);
  };

  const getNodeMetrics = (node: Node) => {
    const tokenBase = node.assignedAgents.length * 17;
    return {
      cpuPercent: node.status === 'online' ? Math.min(92, 28 + tokenBase) : 0,
      memoryPercent: node.status === 'online' ? Math.min(94, 34 + tokenBase) : 0,
      networkUp: node.status === 'online' ? (0.6 + node.assignedAgents.length * 0.8).toFixed(1) : '0.0',
      networkDown: node.status === 'online' ? (0.4 + node.assignedAgents.length * 0.55).toFixed(1) : '0.0',
      uptime: node.status === 'online' ? formatRelativeNodeTime(node.registeredAt) : '\u2014',
    };
  };

  const getNodeAgents = (node: Node) =>
    node.assignedAgents.map((agentId, index) => ({
      memberId: agentId,
      displayName: agentOptions.find((o) => o.memberId === agentId)?.displayName ?? agentId,
      tokens: 12400 + index * 6300,
      cpu: 18 + index * 7,
      memory: `${(0.6 + index * 0.2).toFixed(1)}G`,
      status: (index % 2 === 0 ? 'working' : 'idle') as 'working' | 'idle',
    }));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Compact Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold app-text-strong">Node Fleet</h1>
            </div>
            {/* Inline Metrics */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Server size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{store.nodes.length}</span>
                <span className="app-text-faint">nodes</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-600" />
                <span className="font-semibold text-green-600">{onlineCount}</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Users size={14} className="app-accent-text" />
                <span className="font-semibold app-text-strong">
                  {totalAssignedAgents}/{totalCapacity}
                </span>
                <span className="app-text-faint">agents</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Cpu size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{avgCpu}%</span>
                <span className="app-text-faint">CPU</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <HardDrive size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{avgMemory}%</span>
                <span className="app-text-faint">Mem</span>
              </div>
              {degradedCount > 0 && (
                <>
                  <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-orange-500" />
                    <span className="font-semibold text-orange-500">{degradedCount}</span>
                    <span className="app-text-faint">alerts</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void store.loadNodes()}
              disabled={store.loadState === 'loading'}
            >
              <RefreshCw size={14} className="mr-1" />
              {store.loadState === 'loading' ? 'Loading...' : 'Refresh'}
            </Button>
            <Button variant="outline" size="sm" className="h-8">
              <Settings size={14} className="mr-1" />
              Configure
            </Button>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-2 flex items-center justify-between">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="list" className="gap-2">
              <ListIcon size={14} />
              Fleet Table
            </TabsTrigger>
            <TabsTrigger value="topology" className="gap-2">
              <Network size={14} />
              Topology
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {store.selectedNodeId && (
          <Button variant="ghost" size="sm" onClick={() => store.selectNode(null)}>
            <X size={14} className="mr-1" />
            Close Detail
          </Button>
        )}
      </div>

      {/* Error */}
      {store.loadState === 'error' && (
        <div role="alert" className="px-6 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-950">
          {t('nodes.loadError', { message: store.errorMessage ?? '' })}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6">
          {store.loadState === 'loading' && store.nodes.length === 0 ? (
            <div role="status" className="text-center py-12 app-text-faint">
              {t('nodes.loadingNodes')}
            </div>
          ) : viewMode === 'list' ? (
            <Card className="p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Hostname</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Agents</TableHead>
                    <TableHead className="text-right">CPU</TableHead>
                    <TableHead className="text-right">Memory</TableHead>
                    <TableHead className="text-right">Network</TableHead>
                    <TableHead className="text-right">Uptime</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {store.nodes.map((node) => {
                    const nodeAgents = getNodeAgents(node);
                    const metrics = getNodeMetrics(node);
                    const isExpanded = expandedRows.has(node.id);

                    return (
                      <React.Fragment key={node.id}>
                        <TableRow
                          className="cursor-pointer hover:app-surface-hover"
                          onClick={() => handleNodeClick(node.id)}
                        >
                          <TableCell>
                            {nodeAgents.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRowExpansion(node.id);
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronRight size={14} />
                                )}
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="font-medium font-mono text-sm">
                            {node.hostname}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {node.nodeType === 'k8s_pod' ? 'K8s Pod' : 'Bare Metal'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {node.labels.region ?? 'default'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                node.status === 'online'
                                  ? 'text-green-600 border-green-600'
                                  : node.status === 'degraded'
                                    ? 'text-orange-500 border-orange-500'
                                    : 'text-gray-600 border-gray-600'
                              }
                            >
                              {node.status === 'online' ? (
                                <CheckCircle size={12} className="mr-1" />
                              ) : node.status === 'degraded' ? (
                                <AlertCircle size={12} className="mr-1" />
                              ) : (
                                <XCircle size={12} className="mr-1" />
                              )}
                              {node.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {nodeAgents.length}/4
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono text-sm">{metrics.cpuPercent}%</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono text-sm">{metrics.memoryPercent}%</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end text-xs font-mono">
                              <span className="text-green-600">
                                &uarr; {metrics.networkUp}MB/s
                              </span>
                              <span className="text-blue-600">
                                &darr; {metrics.networkDown}MB/s
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm app-text-faint">
                            {metrics.uptime}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssignClick(node.id);
                              }}
                            >
                              Assign
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row - Agents */}
                        {isExpanded && nodeAgents.length > 0 && (
                          <TableRow key={`${node.id}-agents`}>
                            <TableCell colSpan={11} className="bg-gray-50 dark:bg-gray-900/50">
                              <div className="py-3 px-4">
                                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                                  Hosted Agents
                                </div>
                                <div className="space-y-2">
                                  {nodeAgents.map((agent) => (
                                    <div
                                      key={agent.memberId}
                                      className="flex items-center justify-between p-3 app-surface-strong rounded-lg border app-border-subtle"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div
                                          className={`w-2 h-2 rounded-full ${
                                            agent.status === 'working'
                                              ? 'bg-green-500 animate-pulse'
                                              : 'bg-gray-400'
                                          }`}
                                        />
                                        <Terminal size={14} className="app-text-muted" />
                                        <span className="font-medium text-sm">
                                          {agent.displayName}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-6 text-xs">
                                        <div className="flex items-center gap-1">
                                          <Zap size={12} className="app-text-muted" />
                                          <span className="app-text-faint">
                                            {agent.tokens.toLocaleString()} tokens
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Cpu size={12} className="app-text-muted" />
                                          <span className="font-mono">{agent.cpu}%</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <HardDrive size={12} className="app-text-muted" />
                                          <span className="font-mono">{agent.memory}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
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
          ) : store.nodes.length === 0 ? (
            <p className="text-center py-12 app-text-faint">{t('nodes.empty')}</p>
          ) : (
            <div className="h-full app-surface-strong rounded-lg border app-border-subtle overflow-hidden">
              <NodeTopology
                nodes={store.nodes}
                selectedNodeId={store.selectedNodeId}
                onSelect={store.selectNode}
                onAssignClick={handleAssignClick}
              />
            </div>
          )}
        </div>

        {/* Node Detail Panel */}
        {selectedNode && selectedNodeMetrics && (
          <div className="w-[480px] border-l app-border-subtle app-surface-strong overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold app-text-strong">Node Detail</h2>
                <Button variant="ghost" size="icon" onClick={() => store.selectNode(null)}>
                  <X size={18} />
                </Button>
              </div>

              {/* Node Identity */}
              <Card className="p-4 mb-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                  Node Identity
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="app-text-faint">Hostname</span>
                    <span className="font-mono font-medium app-text-strong">
                      {selectedNode.hostname}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="app-text-faint">Type</span>
                    <Badge variant="outline" className="text-xs">
                      {selectedNode.nodeType === 'k8s_pod' ? 'K8s Pod' : 'Bare Metal'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="app-text-faint">Region</span>
                    <span className="font-medium">
                      {selectedNode.labels.region ?? 'default'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="app-text-faint">Status</span>
                    <Badge
                      variant="outline"
                      className={
                        selectedNode.status === 'online'
                          ? 'text-green-600 border-green-600'
                          : selectedNode.status === 'degraded'
                            ? 'text-orange-500 border-orange-500'
                            : 'text-gray-600 border-gray-600'
                      }
                    >
                      {selectedNode.status === 'online' ? (
                        <CheckCircle size={12} className="mr-1" />
                      ) : selectedNode.status === 'degraded' ? (
                        <AlertCircle size={12} className="mr-1" />
                      ) : (
                        <XCircle size={12} className="mr-1" />
                      )}
                      {selectedNode.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="app-text-faint">Uptime</span>
                    <span className="font-mono text-xs">
                      {formatRelativeNodeTime(selectedNode.registeredAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="app-text-faint">Last Heartbeat</span>
                    <span className="font-mono text-xs">
                      {formatRelativeNodeTime(selectedNode.lastHeartbeatAt)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Resource Metrics */}
              <Card className="p-4 mb-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-4">
                  Resource Metrics (Real-time)
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="mb-2">
                      <Cpu size={20} className="mx-auto app-text-muted" />
                    </div>
                    <div className="text-2xl font-bold app-text-strong mb-1">
                      {selectedNodeMetrics.cpu}%
                    </div>
                    <div className="text-xs app-text-faint">CPU Usage</div>
                    <Progress value={selectedNodeMetrics.cpu} className="mt-2 h-1" />
                  </div>
                  <div className="text-center">
                    <div className="mb-2">
                      <HardDrive size={20} className="mx-auto app-text-muted" />
                    </div>
                    <div className="text-2xl font-bold app-text-strong mb-1">
                      {selectedNodeMetrics.memory}%
                    </div>
                    <div className="text-xs app-text-faint">Memory</div>
                    <Progress value={selectedNodeMetrics.memory} className="mt-2 h-1" />
                  </div>
                  <div className="text-center">
                    <div className="mb-2">
                      <NetworkIcon size={20} className="mx-auto app-text-muted" />
                    </div>
                    <div className="text-sm font-mono font-bold app-text-strong mb-1">
                      {selectedNodeMetrics.networkUp}MB/s
                    </div>
                    <div className="text-xs app-text-faint">Network I/O</div>
                    <div className="mt-2 text-[10px] font-mono text-blue-600">
                      &darr; {selectedNodeMetrics.networkDown}MB/s
                    </div>
                  </div>
                </div>

                {/* CPU Timeline */}
                <div className="mb-4">
                  <div className="text-xs font-semibold app-text-muted mb-2">
                    CPU Timeline (1h)
                  </div>
                  <div className="h-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cpuTimelineData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          strokeOpacity={0.3}
                        />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          interval={14}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          domain={[0, 100]}
                          ticks={[0, 50, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '11px',
                          }}
                          formatter={(value) => [`${Math.round(Number(value))}%`, 'CPU']}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Memory Timeline */}
                <div>
                  <div className="text-xs font-semibold app-text-muted mb-2">
                    Memory Timeline (1h)
                  </div>
                  <div className="h-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={memoryTimelineData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          strokeOpacity={0.3}
                        />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          interval={14}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          domain={[0, 100]}
                          ticks={[0, 50, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '11px',
                          }}
                          formatter={(value) => [`${Math.round(Number(value))}%`, 'Memory']}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#a855f7"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </Card>

              {/* Hosted Agents */}
              <Card className="p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-semibold app-text-faint uppercase tracking-wider">
                    Hosted Agents ({selectedNodeAgentRows.length}/4)
                  </div>
                  <Progress
                    value={(selectedNodeAgentRows.length / 4) * 100}
                    className="w-24 h-1"
                  />
                </div>

                {selectedNodeAgentRows.length > 0 ? (
                  <div className="space-y-2">
                    {selectedNodeAgentRows.map((agent) => (
                      <div
                        key={agent.memberId}
                        className="p-3 app-surface-strong rounded-lg border app-border-subtle"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                agent.status === 'working'
                                  ? 'bg-green-500 animate-pulse'
                                  : 'bg-gray-400'
                              }`}
                            />
                            <span className="font-medium text-sm">{agent.displayName}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-4 app-text-faint">
                            <span>{agent.tokens.toLocaleString()} tokens</span>
                            <span className="font-mono">CPU: {agent.cpu}%</span>
                            <span className="font-mono">Mem: {agent.memory}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 app-text-faint text-sm">
                    No agents assigned
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => handleAssignClick(selectedNode.id)}
                >
                  <Users size={14} className="mr-1" />
                  Assign Agent
                </Button>
              </Card>

              {/* Node Labels */}
              <Card className="p-4 mb-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                  Node Labels &amp; Metadata
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(selectedNode.labels).map(([key, value]) => (
                    <Badge key={key} variant="outline">
                      {key}: {value}
                    </Badge>
                  ))}
                  {selectedNode.nodeType === 'k8s_pod' && (
                    <>
                      <Badge variant="outline">k8s.namespace: kraken-prod</Badge>
                      <Badge variant="outline">pool: default</Badge>
                    </>
                  )}
                </div>
              </Card>

              {/* Actions */}
              <Card className="p-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                  Actions
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled>
                    <Shield size={14} className="mr-1" />
                    Drain
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    <Settings size={14} className="mr-1" />
                    Cordon
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    <Terminal size={14} className="mr-1" />
                    Logs
                  </Button>
                  <Button variant="outline" size="sm" disabled className="text-red-600">
                    <X size={14} className="mr-1" />
                    Deregister
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Node Assignment Modal */}
      <NodeAssignmentDialog
        open={assignmentModalOpen}
        onOpenChange={setAssignmentModalOpen}
        node={assignmentNode}
        allAgents={agentOptions}
        onAssign={async (nodeId, memberId) => {
          await store.assignAgent(nodeId, memberId);
        }}
        onUnassign={async (nodeId, memberId) => {
          await store.unassignAgent(nodeId, memberId);
        }}
      />
    </div>
  );
};

/* ── Node Assignment Dialog ── */

type NodeAssignmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: Node | null;
  allAgents: AgentOption[];
  onAssign: (nodeId: string, memberId: string) => Promise<void>;
  onUnassign: (nodeId: string, memberId: string) => Promise<void>;
};

function NodeAssignmentDialog({
  open,
  onOpenChange,
  node,
  allAgents,
  onAssign,
  onUnassign,
}: NodeAssignmentDialogProps) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  if (!node) return null;

  const assignedAgents = allAgents.filter((a) => node.assignedAgents.includes(a.memberId));
  const availableAgents = allAgents.filter((a) => !node.assignedAgents.includes(a.memberId));

  const handleAssign = async (memberId: string) => {
    setPendingIds((prev) => new Set(prev).add(memberId));
    try {
      await onAssign(node.id, memberId);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  };

  const handleUnassign = async (memberId: string) => {
    setPendingIds((prev) => new Set(prev).add(memberId));
    try {
      await onUnassign(node.id, memberId);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded bg-gradient-to-br from-cyan-500 to-teal-600 text-white text-sm font-mono">
              {node.nodeType === 'k8s_pod' ? 'K8s' : 'BM'}
            </div>
            <div>
              <div className="text-base">Assign Agents to Node</div>
              <div className="text-sm font-normal app-text-muted">{node.hostname}</div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Manage which AI agents are assigned to this node. Assigned agents will execute on
            this infrastructure.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Currently Assigned */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm app-text-strong">
                  Assigned ({assignedAgents.length})
                </h3>
                {assignedAgents.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {assignedAgents.length}/4 capacity
                  </Badge>
                )}
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {assignedAgents.length === 0 ? (
                  <div className="text-center py-12 app-text-muted text-sm">
                    No agents assigned
                  </div>
                ) : (
                  assignedAgents.map((agent) => (
                    <div
                      key={agent.memberId}
                      className="flex items-center gap-3 p-3 rounded-lg border app-border-subtle hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
                          {agent.displayName.charAt(0).toUpperCase()}
                        </div>
                        <StatusDot
                          status="online"
                          className="absolute bottom-0 right-0 ring-2 ring-white dark:ring-gray-800"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm app-text-strong truncate">
                          {agent.displayName}
                        </div>
                        <div className="text-xs app-text-faint">{agent.memberId}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingIds.has(agent.memberId)}
                        onClick={() => void handleUnassign(agent.memberId)}
                        className="flex-shrink-0"
                      >
                        {pendingIds.has(agent.memberId) ? '...' : 'Remove'}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Available Agents */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm app-text-strong">
                  Available ({availableAgents.length})
                </h3>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {availableAgents.length === 0 ? (
                  <div className="text-center py-12 app-text-muted text-sm">
                    No available agents
                  </div>
                ) : (
                  availableAgents.map((agent) => (
                    <div
                      key={agent.memberId}
                      className="flex items-center gap-3 p-3 rounded-lg border app-border-subtle hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingIds.has(agent.memberId)}
                        onClick={() => void handleAssign(agent.memberId)}
                        className="flex-shrink-0"
                      >
                        {pendingIds.has(agent.memberId) ? '...' : 'Assign'}
                      </Button>
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
                          {agent.displayName.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm app-text-strong truncate">
                          {agent.displayName}
                        </div>
                        <div className="text-xs app-text-faint">{agent.memberId}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Node Info */}
          <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border app-border-subtle">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="app-text-faint">Node Type:</span>{' '}
                <span className="app-text-strong font-medium">
                  {node.nodeType === 'k8s_pod' ? 'K8s Pod' : 'Bare Metal'}
                </span>
              </div>
              <div>
                <span className="app-text-faint">Status:</span>{' '}
                <span
                  className={`font-medium ${
                    node.status === 'online'
                      ? 'text-green-600'
                      : node.status === 'degraded'
                        ? 'text-yellow-600'
                        : 'text-gray-600'
                  }`}
                >
                  {node.status}
                </span>
              </div>
              <div>
                <span className="app-text-faint">Capacity:</span>{' '}
                <span className="app-text-strong font-medium">
                  {node.assignedAgents.length}/4 agents
                </span>
              </div>
              <div>
                <span className="app-text-faint">Hostname:</span>{' '}
                <code className="text-xs app-text-strong">{node.hostname}</code>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t app-border-subtle">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            className="app-accent-bg hover:opacity-90 text-white"
            onClick={() => onOpenChange(false)}
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
