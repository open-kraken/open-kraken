import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Server,
  CheckCircle,
  AlertCircle,
  XCircle,
  Users,
  ListIcon,
  Network,
  ChevronRight,
  ChevronDown,
  Terminal,
  X,
  Zap,
  Plus,
  Trash2,
  Search,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { useNodesStore } from '@/state/nodesStore';
import { getAgentStatuses, type AgentStatus } from '@/api/agents';
import { NodeTopology } from '@/features/nodes/NodeTopology';
import type { Node } from '@/types/node';
import type { AgentOption } from '@/features/nodes/NodeAgentAssign';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
import { agentStatusFromApi, resolveAgentStatus, summarizeNodes } from '@/shared/status-model';

type ViewMode = 'list' | 'topology';
type NodeStatusFilter = 'all' | 'online' | 'degraded' | 'offline';
type NodeTypeFilter = 'all' | 'k8s_pod' | 'bare_metal';

type RegisterNodeForm = {
  id: string;
  hostname: string;
  nodeType: 'k8s_pod' | 'bare_metal';
  maxAgents: string;
  labels: string;
};

const emptyRegisterNodeForm: RegisterNodeForm = {
  id: '',
  hostname: '',
  nodeType: 'k8s_pod',
  maxAgents: '4',
  labels: 'region=default',
};

const formatRelativeNodeTime = (iso: string) => {
  if (!iso) return '-';
  const deltaMs = Math.max(0, Date.now() - new Date(iso).getTime());
  if (!Number.isFinite(deltaMs)) return '-';
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ago`;
};

const parseLabels = (raw: string): Record<string, string> => {
  const labels: Record<string, string> = {};
  for (const part of raw.split('\n').flatMap((line) => line.split(','))) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();
    if (key?.trim() && value) labels[key.trim()] = value;
  }
  return labels;
};

export const NodesPage = () => {
  const { t } = useI18n();
  const { realtimeClient, apiClient, workspace } = useAppShell();
  const store = useNodesStore();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentNodeId, setAssignmentNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<NodeStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<NodeTypeFilter>('all');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterNodeForm>(emptyRegisterNodeForm);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [nodeToDeregister, setNodeToDeregister] = useState<Node | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void store.loadNodes();
  }, [store.loadNodes]);

  const loadAgentStatuses = React.useCallback(async () => {
    try {
      const response = await getAgentStatuses(workspace.workspaceId);
      setAgentStatuses(Object.fromEntries(response.agents.map((agent) => [agent.agentId, agent])));
    } catch {
      setAgentStatuses({});
    }
  }, [workspace.workspaceId]);

  useEffect(() => {
    void loadAgentStatuses();
  }, [loadAgentStatuses]);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getMembers()
      .then((response) => {
        if (cancelled) return;
        const members = (response.members ?? []).filter((member) =>
          member.roleType === 'assistant' ||
          Boolean(member.agentInstanceId) ||
          Boolean(member.runtimeReady) ||
          Boolean(member.agentRuntimeState),
        );
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
      void loadAgentStatuses();
    });
    const updatedSub = realtimeClient.subscribe<Node>('node.updated', () => {
      void store.loadNodes();
      void loadAgentStatuses();
    });
    const offlineSub = realtimeClient.subscribe<{ nodeId: string }>('node.offline', () => {
      void store.loadNodes();
      void loadAgentStatuses();
    });
    return () => {
      snapshotSub.unsubscribe();
      updatedSub.unsubscribe();
      offlineSub.unsubscribe();
    };
  }, [loadAgentStatuses, realtimeClient, store.loadNodes]);

  const selectedNode = store.selectedNodeId
    ? store.nodes.find((n) => n.id === store.selectedNodeId) ?? null
    : null;

  const assignmentNode = assignmentNodeId
    ? store.nodes.find((n) => n.id === assignmentNodeId) ?? null
    : null;

  const nodeSummary = summarizeNodes(store.nodes);
  const onlineCount = nodeSummary.online;
  const degradedCount = nodeSummary.degraded;
  const offlineCount = nodeSummary.offline;
  const totalAssignedAgents = store.nodes.reduce((sum, n) => sum + n.assignedAgents.length, 0);
  const getNodeCapacity = (node: Node) => (node.maxAgents > 0 ? node.maxAgents : 4);
  const totalCapacity = Math.max(store.nodes.reduce((sum, n) => sum + getNodeCapacity(n), 0), 1);
  const capacityPercent = Math.round((totalAssignedAgents / totalCapacity) * 100);

  const visibleNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return store.nodes.filter((node) => {
      if (statusFilter !== 'all' && node.status !== statusFilter) return false;
      if (typeFilter !== 'all' && node.nodeType !== typeFilter) return false;
      if (!query) return true;
      const labelText = Object.entries(node.labels)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
        .toLowerCase();
      return (
        node.id.toLowerCase().includes(query) ||
        node.hostname.toLowerCase().includes(query) ||
        labelText.includes(query)
      );
    });
  }, [searchQuery, statusFilter, store.nodes, typeFilter]);

  const selectedNodeAgentRows = useMemo(() => {
    if (!selectedNode) return [];
    return selectedNode.assignedAgents.map((agentId) => ({
      memberId: agentId,
      displayName:
        agentOptions.find((o) => o.memberId === agentId)?.displayName ?? agentId,
      tokens:
        (agentStatuses[agentId]?.totalInputTokens ?? 0) +
        (agentStatuses[agentId]?.totalOutputTokens ?? 0),
      status: (agentStatuses[agentId] && resolveAgentStatus(agentStatusFromApi(agentStatuses[agentId])) === 'running'
        ? 'working'
        : 'idle') as 'working' | 'idle',
      presenceStatus: agentStatuses[agentId]?.presenceStatus ?? 'offline',
      activeTasks: agentStatuses[agentId]?.activeTasks ?? 0,
      terminalStatus: agentStatuses[agentId]?.terminalStatus ?? null,
    }));
  }, [selectedNode, agentOptions, agentStatuses]);

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

  const handleRegisterNode = async () => {
    setRegisterError(null);
    const id = registerForm.id.trim();
    const hostname = registerForm.hostname.trim();
    const maxAgents = Number(registerForm.maxAgents);
    if (!id || !hostname) {
      setRegisterError('Node ID and hostname are required.');
      return;
    }
    if (!Number.isFinite(maxAgents) || maxAgents < 0) {
      setRegisterError('Max agents must be a non-negative number.');
      return;
    }
    setRegistering(true);
    try {
      await store.createNode({
        id,
        hostname,
        nodeType: registerForm.nodeType,
        maxAgents,
        workspaceId: workspace.workspaceId,
        labels: parseLabels(registerForm.labels),
      });
      setRegisterOpen(false);
      setRegisterForm(emptyRegisterNodeForm);
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : 'Node registration failed.');
    } finally {
      setRegistering(false);
    }
  };

  const handleDeregisterNode = async (node: Node) => {
    setActionError(null);
    try {
      await store.removeNode(node.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Node deregistration failed.');
    }
  };

  const getNodeMetrics = (node: Node) => ({
    uptime: node.status === 'online' ? formatRelativeNodeTime(node.registeredAt) : '\u2014',
    heartbeat: formatRelativeNodeTime(node.lastHeartbeatAt),
    capacityPercent: Math.round((node.assignedAgents.length / getNodeCapacity(node)) * 100),
  });

  const getNodeAgents = (node: Node) =>
    node.assignedAgents.map((agentId) => ({
      memberId: agentId,
      displayName: agentOptions.find((o) => o.memberId === agentId)?.displayName ?? agentId,
      tokens:
        (agentStatuses[agentId]?.totalInputTokens ?? 0) +
        (agentStatuses[agentId]?.totalOutputTokens ?? 0),
      status: ((agentStatuses[agentId]?.activeTasks ?? 0) > 0
        ? 'working'
        : 'idle') as 'working' | 'idle',
      presenceStatus: agentStatuses[agentId]?.presenceStatus ?? 'offline',
      activeTasks: agentStatuses[agentId]?.activeTasks ?? 0,
      terminalStatus: agentStatuses[agentId]?.terminalStatus ?? null,
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
                <span className="app-text-faint">capacity</span>
              </div>
              <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full app-accent-bg" style={{ width: `${Math.min(100, capacityPercent)}%` }} />
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
              {offlineCount > 0 && (
                <>
                  <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                  <div className="flex items-center gap-1.5">
                    <XCircle size={14} className="text-red-500" />
                    <span className="font-semibold text-red-500">{offlineCount}</span>
                    <span className="app-text-faint">offline</span>
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
              onClick={() => {
                void store.loadNodes();
                void loadAgentStatuses();
              }}
              disabled={store.loadState === 'loading'}
            >
              <RefreshCw size={14} className="mr-1" />
              {store.loadState === 'loading' ? 'Loading...' : 'Refresh'}
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setRegisterOpen(true)}>
              <Plus size={14} className="mr-1" />
              Register Node
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
      {actionError && (
        <div role="alert" className="px-6 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-950">
          {actionError}
        </div>
      )}

      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search hostname, node ID, or labels"
              className="h-8 pl-9 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as NodeStatusFilter)}
            className="h-8 rounded-md border app-border-subtle app-surface-strong px-2 text-sm app-text-strong"
            aria-label="Filter by node status"
          >
            <option value="all">All statuses</option>
            <option value="online">Online</option>
            <option value="degraded">Degraded</option>
            <option value="offline">Offline</option>
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as NodeTypeFilter)}
            className="h-8 rounded-md border app-border-subtle app-surface-strong px-2 text-sm app-text-strong"
            aria-label="Filter by node type"
          >
            <option value="all">All types</option>
            <option value="k8s_pod">K8s Pod</option>
            <option value="bare_metal">Bare Metal</option>
          </select>
          <div className="text-xs app-text-muted">
            Showing {visibleNodes.length} of {store.nodes.length}
          </div>
        </div>
      </div>

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
                    <TableHead className="text-right">Capacity</TableHead>
                    <TableHead className="text-right">Heartbeat</TableHead>
                    <TableHead className="text-right">Uptime</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleNodes.map((node) => {
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
                            {nodeAgents.length}/{getNodeCapacity(node)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full app-accent-bg"
                                  style={{ width: `${Math.min(100, metrics.capacityPercent)}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs">{metrics.capacityPercent}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm app-text-faint">
                            {metrics.heartbeat}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm app-text-faint">
                            {metrics.uptime}
                          </TableCell>
                          <TableCell className="flex gap-2">
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNodeToDeregister(node);
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row - Agents */}
                        {isExpanded && nodeAgents.length > 0 && (
                          <TableRow key={`${node.id}-agents`}>
                            <TableCell colSpan={10} className="bg-gray-50 dark:bg-gray-900/50">
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
                                        <Badge variant="outline" className="text-[10px]">
                                          {agent.presenceStatus}
                                        </Badge>
                                        {agent.activeTasks > 0 && (
                                          <span className="app-text-muted">{agent.activeTasks} active tasks</span>
                                        )}
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
                  {visibleNodes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 app-text-muted">
                        No nodes match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          ) : visibleNodes.length === 0 ? (
            <p className="text-center py-12 app-text-faint">{t('nodes.empty')}</p>
          ) : (
            <div className="h-full grid grid-rows-[minmax(360px,1fr)_auto] gap-4">
              <div className="app-surface-strong rounded-lg border app-border-subtle overflow-hidden">
                <NodeTopology
                  nodes={visibleNodes}
                  selectedNodeId={store.selectedNodeId}
                  onSelect={store.selectNode}
                  onAssignClick={handleAssignClick}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {visibleNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className={`rounded-lg border p-3 text-left app-surface-strong hover:shadow-sm ${
                      store.selectedNodeId === node.id ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'app-border-subtle'
                    }`}
                    onClick={() => handleNodeClick(node.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold app-text-strong">{node.hostname}</div>
                        <div className="truncate text-xs app-text-faint font-mono">{node.id}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">{node.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <span className="app-text-muted">{node.nodeType === 'k8s_pod' ? 'K8s' : 'Bare metal'}</span>
                      <span className="app-text-muted">{node.labels.region ?? 'default'}</span>
                      <span className="text-right app-text-strong">{node.assignedAgents.length}/{getNodeCapacity(node)} agents</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Node Detail Panel */}
        {selectedNode && (
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

              {/* Runtime Facts */}
              <Card className="p-4 mb-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-4">
                  Runtime Facts
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border app-border-subtle p-3">
                    <div className="text-xs app-text-faint mb-1">Assigned capacity</div>
                    <div className="text-lg font-bold app-text-strong">
                      {selectedNode.assignedAgents.length}/{getNodeCapacity(selectedNode)}
                    </div>
                    <Progress
                      value={(selectedNode.assignedAgents.length / getNodeCapacity(selectedNode)) * 100}
                      className="mt-2 h-1"
                    />
                  </div>
                  <div className="rounded-lg border app-border-subtle p-3">
                    <div className="text-xs app-text-faint mb-1">Last heartbeat</div>
                    <div className="text-lg font-bold app-text-strong">
                      {formatRelativeNodeTime(selectedNode.lastHeartbeatAt)}
                    </div>
                    <div className="text-xs app-text-muted mt-2 font-mono">
                      {selectedNode.lastHeartbeatAt || 'not reported'}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-dashed app-border-subtle p-4 text-sm app-text-muted">
                  CPU, memory, and network telemetry are not exposed by the backend node
                  contract yet. This panel only shows server-authoritative state.
                </div>
              </Card>

              {/* Hosted Agents */}
              <Card className="p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-semibold app-text-faint uppercase tracking-wider">
                    Hosted Agents ({selectedNodeAgentRows.length}/{getNodeCapacity(selectedNode)})
                  </div>
                  <Progress
                    value={(selectedNodeAgentRows.length / getNodeCapacity(selectedNode)) * 100}
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
                            <span>{agent.presenceStatus}</span>
                            {agent.activeTasks > 0 && <span>{agent.activeTasks} active tasks</span>}
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
                  {Object.entries(selectedNode.labels).length > 0 ? Object.entries(selectedNode.labels).map(([key, value]) => (
                    <Badge key={key} variant="outline">
                      {key}: {value}
                    </Badge>
                  )) : (
                    <span className="app-text-muted">No labels reported.</span>
                  )}
                </div>
              </Card>

              {/* Actions */}
              <Card className="p-4">
                <div className="text-xs font-semibold app-text-faint uppercase tracking-wider mb-3">
                  Actions
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleAssignClick(selectedNode.id)}>
                    <Users size={14} className="mr-1" />
                    Assign
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void store.loadNodes();
                      void loadAgentStatuses();
                    }}
                  >
                    <RefreshCw size={14} className="mr-1" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="col-span-2 text-red-600"
                    onClick={() => setNodeToDeregister(selectedNode)}
                  >
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

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register Execution Node</DialogTitle>
            <DialogDescription>
              Register a node with the backend scheduler. Agents can be assigned after the node is created.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <label className="space-y-2 text-sm">
              <span className="font-medium app-text-strong">Node ID</span>
              <Input
                value={registerForm.id}
                onChange={(event) => setRegisterForm((current) => ({ ...current, id: event.target.value }))}
                placeholder="node-us-east-01"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium app-text-strong">Hostname</span>
              <Input
                value={registerForm.hostname}
                onChange={(event) => setRegisterForm((current) => ({ ...current, hostname: event.target.value }))}
                placeholder="worker-01.internal"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium app-text-strong">Node Type</span>
              <select
                value={registerForm.nodeType}
                onChange={(event) => setRegisterForm((current) => ({ ...current, nodeType: event.target.value as RegisterNodeForm['nodeType'] }))}
                className="h-10 w-full rounded-md border app-border-subtle app-surface-strong px-3 text-sm app-text-strong"
              >
                <option value="k8s_pod">K8s Pod</option>
                <option value="bare_metal">Bare Metal</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium app-text-strong">Max Agents</span>
              <Input
                type="number"
                min={0}
                value={registerForm.maxAgents}
                onChange={(event) => setRegisterForm((current) => ({ ...current, maxAgents: event.target.value }))}
              />
            </label>
            <label className="col-span-2 space-y-2 text-sm">
              <span className="font-medium app-text-strong">Labels</span>
              <textarea
                value={registerForm.labels}
                onChange={(event) => setRegisterForm((current) => ({ ...current, labels: event.target.value }))}
                placeholder="region=us-east, pool=default"
                className="min-h-24 w-full rounded-md border app-border-subtle app-surface-strong px-3 py-2 text-sm app-text-strong"
              />
              <span className="text-xs app-text-muted">Use comma or newline separated key=value pairs.</span>
            </label>
          </div>
          {registerError && (
            <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {registerError}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t app-border-subtle pt-4">
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRegisterNode()} disabled={registering}>
              {registering ? 'Registering...' : 'Register Node'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(nodeToDeregister)}
        onOpenChange={(open) => {
          if (!open) setNodeToDeregister(null);
        }}
        title="Deregister node"
        description={
          nodeToDeregister
            ? `Deregister ${nodeToDeregister.hostname}? Assigned agents will be migrated by the backend placement service when possible.`
            : ''
        }
        variant="destructive"
        confirmLabel="Deregister"
        onConfirm={() => {
          if (nodeToDeregister) void handleDeregisterNode(nodeToDeregister);
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
  const [mutationError, setMutationError] = useState<string | null>(null);

  if (!node) return null;

  const assignedAgents = allAgents.filter((a) => node.assignedAgents.includes(a.memberId));
  const availableAgents = allAgents.filter((a) => !node.assignedAgents.includes(a.memberId));
  const atCapacity = node.maxAgents > 0 && assignedAgents.length >= node.maxAgents;

  const handleAssign = async (memberId: string) => {
    setPendingIds((prev) => new Set(prev).add(memberId));
    setMutationError(null);
    try {
      await onAssign(node.id, memberId);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Assign failed');
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
    setMutationError(null);
    try {
      await onUnassign(node.id, memberId);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Remove failed');
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
                    {assignedAgents.length}/{node.maxAgents > 0 ? node.maxAgents : 'unlimited'} capacity
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
                {atCapacity && (
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-500">
                    At capacity
                  </Badge>
                )}
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
                        disabled={pendingIds.has(agent.memberId) || atCapacity}
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

          {mutationError && (
            <div role="alert" className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {mutationError}
            </div>
          )}

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
                  {node.assignedAgents.length}/{node.maxAgents > 0 ? node.maxAgents : 'unlimited'} agents
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
