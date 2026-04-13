import { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  type Connection,
  type NodeTypes,
  Panel,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Pause,
  RotateCcw,
  Filter,
  Clock,
  CheckCircle,
  Circle,
  AlertCircle,
  Activity,
  Terminal,
  GitBranch,
  Code,
  FileCode,
  Settings,
  Users,
  Plus,
  Trash2,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listRuns } from "@/api/v2/runs";
import type { RunDTO } from "@/api/v2/types";

/* ------------------------------------------------------------------ */
/*  Custom node components                                            */
/* ------------------------------------------------------------------ */

const handleStyle = { width: 8, height: 8, background: '#94a3b8', border: '2px solid #fff' };

function AgentNode({ data }: { data: Record<string, any> }) {
  const getStatusColor = () => {
    switch (data.status) {
      case "running":
        return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30";
      case "success":
        return "border-green-500 bg-green-50 dark:bg-green-950/30";
      case "error":
        return "border-red-500 bg-red-50 dark:bg-red-950/30";
      case "pending":
        return "border-gray-300 bg-gray-50 dark:bg-gray-900/30";
      default:
        return "border-gray-300 bg-white dark:bg-gray-900";
    }
  };

  const getStatusIcon = () => {
    switch (data.status) {
      case "running":
        return <Activity size={14} className="text-yellow-600 animate-pulse" />;
      case "success":
        return <CheckCircle size={14} className="text-green-600" />;
      case "error":
        return <AlertCircle size={14} className="text-red-600" />;
      default:
        return <Circle size={14} className="text-gray-400" />;
    }
  };

  return (
    <div className={`px-4 py-3 rounded-lg border-2 ${getStatusColor()} min-w-[180px] shadow-sm relative`}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
          {data.agent?.charAt(0) || "A"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs truncate app-text-strong">{data.label}</div>
        </div>
        {getStatusIcon()}
      </div>
      {data.agent && (
        <div className="text-[10px] app-text-faint mb-1">
          Agent: <span className="font-medium app-text-strong">{data.agent}</span>
        </div>
      )}
      {data.duration && (
        <div className="flex items-center gap-1 text-[10px] app-text-faint">
          <Clock size={10} />
          {data.duration}
        </div>
      )}
      {data.progress !== undefined && (
        <div className="mt-2">
          <Progress value={data.progress} className="h-1" />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
}

function ActionNode({ data }: { data: Record<string, any> }) {
  return (
    <div className="px-3 py-2 rounded-md border border-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 min-w-[140px] relative">
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <div className="flex items-center gap-2">
        <Code size={12} className="text-cyan-600" />
        <div className="text-xs font-medium text-cyan-700 dark:text-cyan-400">{data.label}</div>
      </div>
      {data.description && (
        <div className="text-[10px] text-cyan-600 dark:text-cyan-500 mt-1">
          {data.description}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
}

function DecisionNode({ data }: { data: Record<string, any> }) {
  return (
    <div className="w-28 h-28 rotate-45 border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center relative">
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, transform: 'rotate(-45deg)' }} />
      <div className="-rotate-45 text-center">
        <GitBranch size={16} className="text-orange-600 mx-auto mb-1" />
        <div className="text-xs font-medium text-orange-700 dark:text-orange-400">
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, transform: 'rotate(-45deg)' }} />
      <Handle type="source" id="left" position={Position.Left} style={{ ...handleStyle, transform: 'rotate(-45deg)' }} />
      <Handle type="source" id="right" position={Position.Right} style={{ ...handleStyle, transform: 'rotate(-45deg)' }} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  action: ActionNode,
  decision: DecisionNode,
};

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

const availableAgents = [
  { id: "a1", name: "Claude BE", provider: "Anthropic", status: "online" as const },
  { id: "a2", name: "Gemini FE", provider: "Google", status: "working" as const },
  { id: "a3", name: "GPT-4 QA", provider: "OpenAI", status: "online" as const },
  { id: "a4", name: "Claude Reviewer", provider: "Anthropic", status: "online" as const },
  { id: "a5", name: "Qwen API", provider: "Alibaba", status: "working" as const },
  { id: "a6", name: "Codex DevOps", provider: "OpenAI", status: "online" as const },
  { id: "a7", name: "Shell Ops", provider: "Gemini", status: "offline" as const },
  { id: "a8", name: "System", provider: "Internal", status: "online" as const },
];

const availableNodes = [
  { id: "n1", hostname: "k8s-alpha-01", type: "K8s Pod", status: "online" as const },
  { id: "n2", hostname: "k8s-alpha-02", type: "K8s Pod", status: "online" as const },
  { id: "n3", hostname: "k8s-beta-01", type: "K8s Pod", status: "online" as const },
  { id: "n4", hostname: "bare-metal-01", type: "Bare Metal", status: "online" as const },
  { id: "n5", hostname: "bare-metal-02", type: "Bare Metal", status: "degraded" as const },
];

const initialNodes: Node[] = [
  {
    id: "start",
    type: "agent",
    position: { x: 250, y: 50 },
    data: {
      label: "Task Initialized", status: "success", agent: "System", node: "k8s-alpha-01",
      taskId: "TASK-001", duration: "0.2s",
      scheduledDate: "2026-04-09", startTime: "14:31:18", endTime: "14:31:20",
    },
  },
  {
    id: "code-review",
    type: "agent",
    position: { x: 250, y: 180 },
    data: {
      label: "Code Review", status: "success", agent: "Claude BE", node: "k8s-alpha-01",
      taskId: "TASK-002", duration: "3.4s", progress: 100,
      scheduledDate: "2026-04-09", startTime: "14:31:20", endTime: "14:31:24",
    },
  },
  {
    id: "decision-1",
    type: "decision",
    position: { x: 220, y: 320 },
    data: { label: "Approved?" },
  },
  {
    id: "ui-generation",
    type: "agent",
    position: { x: 100, y: 480 },
    data: {
      label: "UI Generation", status: "running", agent: "Gemini FE", node: "k8s-alpha-02",
      taskId: "TASK-003", duration: "2.1s", progress: 65,
      scheduledDate: "2026-04-09", startTime: "14:33:12", endTime: "",
    },
  },
  {
    id: "test-gen",
    type: "agent",
    position: { x: 400, y: 480 },
    data: {
      label: "Test Generation", status: "pending", agent: "GPT-4 QA", node: "k8s-beta-01",
      taskId: "TASK-004", duration: "",
      scheduledDate: "2026-04-09", startTime: "", endTime: "",
    },
  },
  {
    id: "git-commit",
    type: "action",
    position: { x: 230, y: 620 },
    data: {
      label: "Git Commit", description: "Create PR", agent: "Codex DevOps", node: "k8s-alpha-01",
      taskId: "TASK-005", scheduledDate: "2026-04-09", startTime: "", endTime: "",
    },
  },
  {
    id: "deploy",
    type: "action",
    position: { x: 230, y: 730 },
    data: {
      label: "Deploy to Staging", description: "kubectl apply", agent: "Codex DevOps", node: "bare-metal-01",
      taskId: "TASK-006", scheduledDate: "2026-04-09", startTime: "", endTime: "",
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: "e1",
    source: "start",
    target: "code-review",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#10b981", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981", width: 20, height: 20 },
    interactionWidth: 20,
    reconnectable: true,
  },
  {
    id: "e2",
    source: "code-review",
    target: "decision-1",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#94a3b8", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 20, height: 20 },
    interactionWidth: 20,
    reconnectable: true,
  },
  {
    id: "e3",
    source: "decision-1",
    target: "ui-generation",
    label: "\u2713 approved",
    type: "smoothstep",
    animated: true,
    style: { stroke: "#eab308", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#eab308", width: 20, height: 20 },
    labelStyle: { fill: "#eab308", fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: "#fef3c7" },
    interactionWidth: 20,
    reconnectable: true,
  },
  {
    id: "e4",
    source: "decision-1",
    target: "test-gen",
    label: "parallel",
    type: "smoothstep",
    animated: true,
    style: { stroke: "#eab308", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#eab308", width: 20, height: 20 },
    labelStyle: { fill: "#eab308", fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: "#fef3c7" },
    interactionWidth: 20,
    reconnectable: true,
  },
  {
    id: "e5",
    source: "ui-generation",
    target: "git-commit",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#94a3b8", strokeWidth: 2, strokeDasharray: "5,5" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 20, height: 20 },
    interactionWidth: 20,
    reconnectable: true,
  },
  {
    id: "e6",
    source: "test-gen",
    target: "git-commit",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#d1d5db", strokeWidth: 2, strokeDasharray: "5,5" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#d1d5db", width: 20, height: 20 },
    interactionWidth: 20,
    reconnectable: true,
  },
  {
    id: "e7",
    source: "git-commit",
    target: "deploy",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#d1d5db", strokeWidth: 2, strokeDasharray: "5,5" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#d1d5db", width: 20, height: 20 },
    interactionWidth: 20,
    reconnectable: true,
  },
];

const executionLog = [
  {
    id: "log-1",
    timestamp: "14:32:45",
    node: "Code Review",
    agent: "Claude BE",
    type: "success" as const,
    message: "Code review completed. Found 2 minor issues, approved with suggestions.",
  },
  {
    id: "log-2",
    timestamp: "14:33:12",
    node: "UI Generation",
    agent: "Gemini FE",
    type: "running" as const,
    message: "Generating responsive dashboard components...",
  },
  {
    id: "log-3",
    timestamp: "14:31:20",
    node: "Task Initialized",
    agent: "System",
    type: "success" as const,
    message: "Workflow started for PR #234: Add analytics dashboard",
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

/* Default styling applied to every newly drawn edge */
const defaultEdgeOptions = {
  type: "smoothstep" as const,
  style: { stroke: "#94a3b8", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 20, height: 20 },
  interactionWidth: 20,
};

const connectionLineStyle = { stroke: "#0ea5e9", strokeWidth: 2, strokeDasharray: "6,3" };

let nodeIdCounter = 100;

type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

export function TaskMapPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selection, setSelection] = useState<Selection>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedView, setSelectedView] = useState<"graph" | "logs" | "details" | "runs">("graph");
  const [v2Runs, setV2Runs] = useState<RunDTO[]>([]);

  useEffect(() => {
    const load = () => {
      listRuns({ limit: 10 })
        .then((data) => setV2Runs(Array.isArray(data) ? data : []))
        .catch(() => setV2Runs([]));
    };
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const selectedNode = selection?.kind === "node" ? nodes.find((n) => n.id === selection.id) ?? null : null;
  const selectedEdge = selection?.kind === "edge" ? edges.find((e) => e.id === selection.id) ?? null : null;

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "smoothstep",
            style: { stroke: "#94a3b8", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 20, height: 20 },
            interactionWidth: 20,
            reconnectable: true,
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) =>
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelection({ kind: "node", id: node.id });
    setSelectedView("graph");
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelection({ kind: "edge", id: edge.id });
    setSelectedView("graph");
  }, []);

  const onPaneClick = useCallback(() => {
    setSelection(null);
  }, []);

  /* ── Mutators ── */

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelection(null);
    },
    [setNodes, setEdges],
  );

  const updateEdge = useCallback(
    (edgeId: string, patch: Partial<Edge>) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
      );
    },
    [setEdges],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelection(null);
    },
    [setEdges],
  );

  const addNode = useCallback(
    (type: "agent" | "action" | "decision") => {
      const id = `node-${++nodeIdCounter}`;
      const defaults: Record<string, Record<string, unknown>> = {
        agent: { label: "New Task", status: "pending", agent: "Unassigned" },
        action: { label: "New Action", description: "" },
        decision: { label: "Check?" },
      };
      setNodes((nds) => [
        ...nds,
        { id, type, position: { x: 300, y: 200 }, data: defaults[type] },
      ]);
    },
    [setNodes],
  );

  /* helper to resolve a node id to its label */
  const nodeName = (id: string) => {
    const n = nodes.find((nd) => nd.id === id);
    return (n?.data.label as string) || id;
  };

  const totalNodes = nodes.filter((n) => n.type === "agent").length;
  const completedNodes = nodes.filter((n) => n.type === "agent" && n.data.status === "success").length;
  const runningNodes = nodes.filter((n) => n.type === "agent" && n.data.status === "running").length;
  const errorNodes = nodes.filter((n) => n.type === "agent" && n.data.status === "error").length;
  const progressPercentage = Math.round((completedNodes / totalNodes) * 100);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold app-text-strong">Task Map</h1>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Activity size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{totalNodes}</span>
                <span className="app-text-faint">nodes</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-600" />
                <span className="font-semibold text-green-600">{completedNodes}</span>
                <span className="app-text-faint">done</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Activity size={14} className="text-yellow-600" />
                <span className="font-semibold text-yellow-600">{runningNodes}</span>
                <span className="app-text-faint">running</span>
              </div>
              {errorNodes > 0 && (
                <>
                  <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-red-600" />
                    <span className="font-semibold text-red-600">{errorNodes}</span>
                    <span className="app-text-faint">errors</span>
                  </div>
                </>
              )}
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <span className="font-semibold app-text-strong">{progressPercentage}%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Add node buttons */}
            <div className="flex gap-1 p-1 app-surface-strong rounded-lg border app-border-subtle mr-2">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => addNode("agent")}>
                <Plus size={12} className="mr-1" />
                Task
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => addNode("action")}>
                <Plus size={12} className="mr-1" />
                Action
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => addNode("decision")}>
                <Plus size={12} className="mr-1" />
                Decision
              </Button>
            </div>

            <Button variant="outline" size="sm" className="h-8" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={14} className="mr-1" /> : <Pause size={14} className="mr-1" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <Button variant="outline" size="sm" className="h-8">
              <RotateCcw size={14} className="mr-1" />
              Restart
            </Button>
            <Button variant="outline" size="sm" className="h-8">
              <Filter size={14} className="mr-1" />
              Filter
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Flow Graph */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineStyle={connectionLineStyle}
            edgesReconnectable
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={["Backspace", "Delete"]}
            className="app-bg-surface"
          >
            <Background color="#94a3b8" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                switch (node.data.status) {
                  case "running":
                    return "#eab308";
                  case "success":
                    return "#10b981";
                  case "error":
                    return "#ef4444";
                  default:
                    return "#9ca3af";
                }
              }}
              maskColor="rgba(0, 0, 0, 0.1)"
            />

            {/* Workflow Info Panel */}
            <Panel position="top-left" className="m-4">
              <Card className="p-3 shadow-lg">
                <div className="text-xs font-semibold app-text-strong mb-2">Current Workflow</div>
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch size={14} className="app-accent-text" />
                  <span className="text-xs app-text-strong">feature/analytics-dashboard</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <FileCode size={14} className="app-text-muted" />
                  <span className="text-xs app-text-faint">PR #234</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={14} className="app-text-muted" />
                  <div className="flex -space-x-2">
                    {["Claude BE", "Gemini FE", "GPT-4 QA"].map((agent, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white dark:border-gray-900 flex items-center justify-center text-white text-[8px] font-bold"
                      >
                        {agent.charAt(0)}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Panel>

            {/* Legend */}
            <Panel position="bottom-left" className="m-4">
              <Card className="p-3 shadow-lg">
                <div className="text-[10px] font-semibold app-text-strong mb-2">Legend</div>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded border-2 border-green-500 bg-green-50" />
                    <span className="app-text-faint">Completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded border-2 border-yellow-500 bg-yellow-50" />
                    <span className="app-text-faint">Running</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded border-2 border-gray-300 bg-gray-50" />
                    <span className="app-text-faint">Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded border-2 border-red-500 bg-red-50" />
                    <span className="app-text-faint">Error</span>
                  </div>
                </div>
              </Card>
            </Panel>
          </ReactFlow>
        </div>

        {/* Right Sidebar */}
        <div className="w-[360px] app-surface-strong border-l app-border-subtle flex flex-col">
          <div className="border-b app-border-subtle px-4 py-3">
            <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as typeof selectedView)}>
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="graph" className="text-xs">Details</TabsTrigger>
                <TabsTrigger value="logs" className="text-xs">Logs</TabsTrigger>
                <TabsTrigger value="details" className="text-xs">Config</TabsTrigger>
                <TabsTrigger value="runs" className="text-xs">Runs</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1 p-4">
            {selectedView === "graph" && (
              <div className="space-y-4">
                {/* ── Node selected ── */}
                {selectedNode ? (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs capitalize">{selectedNode.type} node</Badge>
                      <span className="text-[10px] font-mono app-text-faint">{selectedNode.id}</span>
                    </div>

                    {/* ─ Identity ─ */}
                    {(() => {
                      const locked = selectedNode.data.status === "success";
                      return (
                        <Card className="p-3 space-y-2.5">
                          <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider">Identity</div>
                          <div>
                            <Label className="text-[11px] app-text-faint">Task Label</Label>
                            <Input
                              value={(selectedNode.data.label as string) ?? ""}
                              onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                              disabled={locked}
                              className="h-8 text-sm mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] app-text-faint">Task ID</Label>
                            <Input
                              value={(selectedNode.data.taskId as string) ?? ""}
                              onChange={(e) => updateNodeData(selectedNode.id, { taskId: e.target.value })}
                              disabled={locked}
                              placeholder="e.g. TASK-001"
                              className="h-8 text-sm mt-1 font-mono"
                            />
                          </div>
                          {selectedNode.type === "action" && (
                            <div>
                              <Label className="text-[11px] app-text-faint">Description</Label>
                              <Input
                                value={(selectedNode.data.description as string) ?? ""}
                                onChange={(e) => updateNodeData(selectedNode.id, { description: e.target.value })}
                                disabled={locked}
                                className="h-8 text-sm mt-1"
                              />
                            </div>
                          )}
                        </Card>
                      );
                    })()}

                    {/* ─ Execution Context ─ */}
                    {selectedNode.type !== "decision" && (() => {
                      const done = selectedNode.data.status === "success";
                      return (
                        <Card className="p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider">Execution</div>
                            {done && <Badge variant="outline" className="text-[10px] text-green-600 border-green-600">Completed</Badge>}
                          </div>
                          <div>
                            <Label className="text-[11px] app-text-faint">Agent</Label>
                            <Select
                              value={(selectedNode.data.agent as string) ?? ""}
                              onValueChange={(v) => updateNodeData(selectedNode.id, { agent: v })}
                              disabled={done}
                            >
                              <SelectTrigger className="h-8 text-sm mt-1">
                                <SelectValue placeholder="Select agent" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableAgents.map((a) => (
                                  <SelectItem key={a.id} value={a.name}>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${a.status === "online" ? "bg-green-500" : a.status === "working" ? "bg-yellow-500" : "bg-gray-400"}`} />
                                      <span>{a.name}</span>
                                      <span className="text-[10px] app-text-faint">({a.provider})</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[11px] app-text-faint">Node (Runtime)</Label>
                            <Select
                              value={(selectedNode.data.node as string) ?? ""}
                              onValueChange={(v) => updateNodeData(selectedNode.id, { node: v })}
                              disabled={done}
                            >
                              <SelectTrigger className="h-8 text-sm mt-1 font-mono">
                                <SelectValue placeholder="Select node" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableNodes.map((n) => (
                                  <SelectItem key={n.id} value={n.hostname}>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${n.status === "online" ? "bg-green-500" : n.status === "degraded" ? "bg-yellow-500" : "bg-red-500"}`} />
                                      <span className="font-mono">{n.hostname}</span>
                                      <Badge variant="outline" className="text-[9px] py-0 h-4">{n.type}</Badge>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {selectedNode.type === "agent" && (
                            <div>
                              <Label className="text-[11px] app-text-faint">Status</Label>
                              <Select
                                value={(selectedNode.data.status as string) ?? "pending"}
                                onValueChange={(v) => updateNodeData(selectedNode.id, { status: v })}
                              >
                                <SelectTrigger className="h-8 text-sm mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="running">Running</SelectItem>
                                  <SelectItem value="success">Success</SelectItem>
                                  <SelectItem value="error">Error</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </Card>
                      );
                    })()}

                    {/* ─ Schedule & Timing ─ */}
                    {(() => {
                      const locked = selectedNode.data.status === "success";
                      return (
                        <Card className="p-3 space-y-2.5">
                          <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider">Schedule &amp; Timing</div>
                          <div>
                            <Label className="text-[11px] app-text-faint">Scheduled Date</Label>
                            <Input
                              type="date"
                              value={(selectedNode.data.scheduledDate as string) ?? ""}
                              onChange={(e) => updateNodeData(selectedNode.id, { scheduledDate: e.target.value })}
                              disabled={locked}
                              className="h-8 text-sm mt-1"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[11px] app-text-faint">Start Time</Label>
                              <Input
                                type="time"
                                step="1"
                                value={(selectedNode.data.startTime as string) ?? ""}
                                onChange={(e) => updateNodeData(selectedNode.id, { startTime: e.target.value })}
                                disabled={locked}
                                className="h-8 text-sm mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] app-text-faint">End Time</Label>
                              <Input
                                type="time"
                                step="1"
                                value={(selectedNode.data.endTime as string) ?? ""}
                                onChange={(e) => updateNodeData(selectedNode.id, { endTime: e.target.value })}
                                disabled={locked}
                                className="h-8 text-sm mt-1"
                              />
                            </div>
                          </div>
                          {selectedNode.type === "agent" && (
                            <>
                              <div>
                                <Label className="text-[11px] app-text-faint">Duration</Label>
                                <Input
                                  value={(selectedNode.data.duration as string) ?? ""}
                                  onChange={(e) => updateNodeData(selectedNode.id, { duration: e.target.value })}
                                  placeholder="e.g. 3.4s"
                                  disabled={locked}
                                  className="h-8 text-sm mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-[11px] app-text-faint">Progress (%)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={(selectedNode.data.progress as number) ?? ""}
                                  onChange={(e) => updateNodeData(selectedNode.id, { progress: e.target.value === "" ? undefined : Number(e.target.value) })}
                                  placeholder="0–100"
                                  disabled={locked}
                                  className="h-8 text-sm mt-1"
                                />
                              </div>
                            </>
                          )}
                        </Card>
                      );
                    })()}

                    {/* Status output cards */}
                    {selectedNode.data.status === "success" && (
                      <Card className="p-3 bg-green-50 dark:bg-green-950/20 border-green-200">
                        <div className="flex items-start gap-2">
                          <CheckCircle size={14} className="text-green-600 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Output</div>
                            <p className="text-xs text-green-600 dark:text-green-500">
                              Code review completed. Found 2 minor issues, approved with suggestions.
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}

                    {selectedNode.data.status === "running" && (
                      <Card className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200">
                        <div className="flex items-start gap-2">
                          <Activity size={14} className="text-yellow-600 mt-0.5 animate-pulse" />
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-2">In Progress</div>
                            <Progress value={(selectedNode.data.progress as number) || 0} className="h-1.5 mb-2" />
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Actions */}
                    <div className="pt-3 border-t app-border-subtle space-y-2">
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <Terminal size={12} className="mr-2" />
                        View Logs
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <RotateCcw size={12} className="mr-2" />
                        Retry Node
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-red-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => deleteNode(selectedNode.id)}
                      >
                        <Trash2 size={12} className="mr-2" />
                        Delete Node
                      </Button>
                    </div>
                  </>
                ) : selectedEdge ? (
                  /* ── Edge selected ── */
                  <>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        <ArrowRight size={10} className="mr-1" />
                        Connection
                      </Badge>
                      <span className="text-[10px] font-mono app-text-faint">{selectedEdge.id}</span>
                    </div>

                    {/* Visual summary */}
                    <Card className="p-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium app-text-strong">{nodeName(selectedEdge.source)}</span>
                        <ArrowRight size={14} className="app-text-muted" />
                        <span className="font-medium app-text-strong">{nodeName(selectedEdge.target)}</span>
                      </div>
                    </Card>

                    {/* Editable fields */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs app-text-faint">Label</Label>
                        <Input
                          value={(selectedEdge.label as string) ?? ""}
                          onChange={(e) => updateEdge(selectedEdge.id, { label: e.target.value || undefined })}
                          placeholder="e.g. approved, parallel"
                          className="h-8 text-sm mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-xs app-text-faint">Line style</Label>
                        <Select
                          value={selectedEdge.animated ? "animated" : selectedEdge.style?.strokeDasharray ? "dashed" : "solid"}
                          onValueChange={(v) => {
                            const base = { ...(selectedEdge.style ?? {}), strokeDasharray: undefined as string | undefined };
                            if (v === "dashed") base.strokeDasharray = "5,5";
                            updateEdge(selectedEdge.id, { style: base, animated: v === "animated" });
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="solid">Solid</SelectItem>
                            <SelectItem value="dashed">Dashed</SelectItem>
                            <SelectItem value="animated">Animated</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs app-text-faint">Color</Label>
                        <Select
                          value={(selectedEdge.style as Record<string, string> | undefined)?.stroke ?? "#94a3b8"}
                          onValueChange={(color) => {
                            updateEdge(selectedEdge.id, {
                              style: { ...(selectedEdge.style ?? {}), stroke: color },
                              markerEnd: { type: MarkerType.ArrowClosed, color, width: 20, height: 20 },
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="#10b981">
                              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#10b981]" />Green (done)</span>
                            </SelectItem>
                            <SelectItem value="#eab308">
                              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#eab308]" />Yellow (active)</span>
                            </SelectItem>
                            <SelectItem value="#94a3b8">
                              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#94a3b8]" />Gray (default)</span>
                            </SelectItem>
                            <SelectItem value="#d1d5db">
                              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#d1d5db]" />Light gray (pending)</span>
                            </SelectItem>
                            <SelectItem value="#ef4444">
                              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#ef4444]" />Red (error)</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t app-border-subtle space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-red-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => deleteEdge(selectedEdge.id)}
                      >
                        <Trash2 size={12} className="mr-2" />
                        Delete Connection
                      </Button>
                    </div>
                  </>
                ) : (
                  /* ── Nothing selected ── */
                  <div className="text-center py-8">
                    <Pencil size={32} className="app-text-faint mx-auto mb-2" />
                    <p className="text-sm app-text-faint">Click a node or connection to edit</p>
                    <p className="text-xs app-text-faint mt-1">Drag from handles to draw new connections</p>
                  </div>
                )}
              </div>
            )}

            {selectedView === "logs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold app-text-strong">Execution Log</h3>
                  <Badge variant="outline" className="text-xs">
                    {executionLog.length} events
                  </Badge>
                </div>
                {executionLog.map((log) => (
                  <Card key={log.id} className="p-3">
                    <div className="flex items-start gap-2 mb-2">
                      {log.type === "success" && (
                        <CheckCircle size={14} className="text-green-600 mt-0.5" />
                      )}
                      {log.type === "running" && (
                        <Activity size={14} className="text-yellow-600 mt-0.5 animate-pulse" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold app-text-strong">{log.node}</span>
                          <span className="text-[10px] font-mono app-text-faint">{log.timestamp}</span>
                        </div>
                        <div className="text-[10px] app-text-faint mb-1">Agent: {log.agent}</div>
                        <p className="text-xs app-text-muted">{log.message}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {selectedView === "details" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold app-text-strong mb-3">Workflow Configuration</h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="app-text-faint mb-1">Trigger</div>
                      <div className="font-medium app-text-strong">Pull Request Created</div>
                    </div>
                    <div>
                      <div className="app-text-faint mb-1">Repository</div>
                      <div className="font-mono app-text-strong">open-kraken/frontend</div>
                    </div>
                    <div>
                      <div className="app-text-faint mb-1">Branch</div>
                      <div className="font-mono app-text-strong">feature/analytics-dashboard</div>
                    </div>
                    <div>
                      <div className="app-text-faint mb-1">Assigned Agents</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px]">Claude BE</Badge>
                        <Badge variant="outline" className="text-[10px]">Gemini FE</Badge>
                        <Badge variant="outline" className="text-[10px]">GPT-4 QA</Badge>
                        <Badge variant="outline" className="text-[10px]">Codex DevOps</Badge>
                      </div>
                    </div>
                    <div>
                      <div className="app-text-faint mb-1">Timeout</div>
                      <div className="font-mono app-text-strong">30 minutes</div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t app-border-subtle">
                  <h4 className="text-xs font-semibold app-text-strong mb-2">Advanced</h4>
                  <Button variant="outline" size="sm" className="w-full justify-start mb-2">
                    <Code size={12} className="mr-2" />
                    View Workflow YAML
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Settings size={12} className="mr-2" />
                    Edit Configuration
                  </Button>
                </div>
              </div>
            )}

            {selectedView === "runs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold app-text-strong">Live Runs</h3>
                  <Badge variant="outline" className="text-xs">{v2Runs.length}</Badge>
                </div>
                {v2Runs.length === 0 && (
                  <Card className="p-4 text-center">
                    <Activity size={24} className="app-text-faint mx-auto mb-2" />
                    <p className="text-xs app-text-faint">No runs from AEL</p>
                  </Card>
                )}
                {v2Runs.map((run) => {
                  const stateColor =
                    run.state === "running"
                      ? "text-yellow-600 border-yellow-400"
                      : run.state === "succeeded"
                        ? "text-green-600 border-green-400"
                        : run.state === "failed"
                          ? "text-red-600 border-red-400"
                          : "text-gray-500 border-gray-300";
                  return (
                    <Card key={run.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium app-text-strong truncate">
                            {run.objective || "(no objective)"}
                          </div>
                          <div className="text-[10px] font-mono app-text-faint truncate mt-0.5">
                            {run.id}
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${stateColor}`}>
                          {run.state}
                        </Badge>
                      </div>
                      {run.token_budget > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] app-text-faint mb-1">
                            <span>Tokens</span>
                            <span>{run.tokens_used.toLocaleString()} / {run.token_budget.toLocaleString()}</span>
                          </div>
                          <Progress
                            value={Math.min(100, (run.tokens_used / run.token_budget) * 100)}
                            className="h-1"
                          />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
