import { useState, useCallback, useEffect, useMemo } from "react";
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
  type NodeProps,
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Play,
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
  Copy,
  Map,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listRuns } from "@/api/v2/runs";
import type { RunDTO } from "@/api/v2/types";
import { getAgentStatuses, type AgentStatus } from "@/api/agents";
import { assignAgentToNode, getNodes } from "@/api/nodes";
import type { Node as RuntimeNode } from "@/types/node";
import { useAppShell } from "@/state/app-shell-store";
import type { RoadmapDocument, RoadmapTaskItem, RoadmapResponse as RoadmapFeatureResponse } from "@/features/roadmap-project-data/api-client";
import { normalizeRoadmapDocument } from "@/features/roadmap-project-data/api-client";
import {
  ackQueueTask,
  cancelQueueTask,
  claimQueueTaskById,
  createQueueTask,
  listQueueTasks,
  nackQueueTask,
  startQueueTask,
  type QueueTask,
} from "@/api/taskqueue";

/* ------------------------------------------------------------------ */
/*  Custom node components                                            */
/* ------------------------------------------------------------------ */

const handleStyle = { width: 8, height: 8, background: '#94a3b8', border: '2px solid #fff' };

type TaskMapNodeProps = NodeProps<Node<Record<string, any>>>;

const selectedNodeClass = (selected: boolean) =>
  selected ? " ring-4 ring-cyan-400/70 shadow-xl shadow-cyan-500/20 scale-[1.02]" : "";

function AgentNode({ data, selected }: TaskMapNodeProps) {
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
    <div className={`px-4 py-3 rounded-lg border-2 ${getStatusColor()} min-w-[180px] shadow-sm relative transition-all ${selectedNodeClass(selected)}`}>
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

function ActionNode({ data, selected }: TaskMapNodeProps) {
  return (
    <div className={`px-3 py-2 rounded-md border border-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 min-w-[140px] relative transition-all ${selectedNodeClass(selected)}`}>
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

function DecisionNode({ data, selected }: TaskMapNodeProps) {
  return (
    <div className={`w-28 h-28 rotate-45 border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center relative transition-all ${selectedNodeClass(selected)}`}>
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

function RoadmapNode({ data, selected }: TaskMapNodeProps) {
  const statusTone =
    data.status === "success"
      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/25"
      : data.status === "running"
        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/25"
        : data.status === "error"
          ? "border-red-500 bg-red-50 dark:bg-red-950/25"
          : "border-slate-300 bg-white dark:bg-slate-950";

  return (
    <div className={`px-4 py-3 rounded-md border-2 ${statusTone} min-w-[220px] max-w-[260px] shadow-sm relative transition-all ${selectedNodeClass(selected)}`}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flex items-start gap-2">
        <Map size={14} className="app-accent-text mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider app-text-faint">Roadmap step {data.number}</div>
          <div className="text-xs font-semibold app-text-strong truncate">{data.label}</div>
          <div className="mt-1 text-[10px] app-text-faint capitalize">{data.roadmapStatus}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <Handle type="source" id="details" position={Position.Bottom} style={handleStyle} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  action: ActionNode,
  decision: DecisionNode,
  roadmap: RoadmapNode,
};

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

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
type NodeContextMenuState = { nodeId: string; x: number; y: number } | null;
type NodeEditDraft = {
  label: string;
  taskId: string;
  description: string;
  agent: string;
  status: string;
  scheduledDate: string;
};

const taskStatusToNodeStatus = (status: string) => {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "error";
    case "running":
      return "running";
    default:
      return "pending";
  }
};

const formatMillis = (value?: number) => {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const taskDuration = (task: QueueTask) => {
  const start = task.startedAt || task.claimedAt || task.createdAt;
  const end = task.completedAt || task.updatedAt;
  if (!start || !end || end <= start) return "";
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const taskLabel = (task: QueueTask) => {
  try {
    const parsed = JSON.parse(task.payload) as { label?: unknown; title?: unknown };
    const label = parsed.label ?? parsed.title;
    if (label) return String(label);
  } catch {
    // Payload is user-provided JSON; fall back to task type when it is opaque.
  }
  return task.type || task.id;
};

const mapTaskToNode = (task: QueueTask, index: number): Node => ({
  id: task.id,
  type: "agent",
  position: { x: 160 + (index % 3) * 280, y: 300 + Math.floor(index / 3) * 180 },
  data: {
    label: taskLabel(task),
    status: taskStatusToNodeStatus(task.status),
    backendStatus: task.status,
    backendTaskId: task.id,
    agent: task.agentId || "Unassigned",
    agentId: task.agentId,
    node: task.nodeId || "",
    nodeId: task.nodeId || "",
    taskId: task.id,
    queue: task.queue || "default",
    taskType: task.type,
    duration: taskDuration(task),
    progress: task.status === "completed" ? 100 : task.status === "running" ? 50 : undefined,
    scheduledDate: task.createdAt ? new Date(task.createdAt).toISOString().slice(0, 10) : "",
    startTime: formatMillis(task.startedAt),
    endTime: formatMillis(task.completedAt),
    lastError: task.lastError,
    result: task.result,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  },
});

const mapTasksToEdges = (tasks: QueueTask[]): Edge[] =>
  tasks.slice(1).map((task, index) => {
    const previous = tasks[index];
    const color = task.status === "completed" ? "#10b981" : task.status === "running" ? "#eab308" : "#94a3b8";
    return {
      id: `queue-edge-${previous.id}-${task.id}`,
      source: previous.id,
      target: task.id,
      type: "smoothstep",
      animated: task.status === "running",
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 20, height: 20 },
      interactionWidth: 20,
      reconnectable: true,
    };
  });

const emptyRoadmap: RoadmapDocument = { objective: "", tasks: [] };

const roadmapStatusToNodeStatus = (status: string) => {
  switch (status) {
    case "done":
      return "success";
    case "in_progress":
      return "running";
    case "blocked":
      return "error";
    default:
      return "pending";
  }
};

const roadmapStatusClass = (status: string) =>
  status === "done"
    ? "text-green-600 border-green-400"
    : status === "in_progress"
      ? "text-sky-600 border-sky-400"
      : status === "blocked"
        ? "text-red-600 border-red-400"
        : "text-gray-500 border-gray-300";

const normalizeRoadmapResponseForTaskMap = (response: Awaited<ReturnType<ReturnType<typeof useAppShell>["apiClient"]["getRoadmapDocument"]>>): RoadmapFeatureResponse =>
  ({
    ...response,
    readOnly: response.readOnly ?? false,
    readOnlyReason: response.readOnlyReason ?? undefined,
  }) as RoadmapFeatureResponse;

const mapRoadmapTaskToNode = (task: RoadmapTaskItem, index: number): Node => ({
  id: `roadmap-${task.id}`,
  type: "roadmap",
  position: { x: 80 + index * 300, y: 60 },
  data: {
    label: task.title || `Step ${task.number}`,
    status: roadmapStatusToNodeStatus(task.status),
    roadmapStatus: task.status,
    roadmapTaskId: task.id,
    taskId: task.id,
    number: task.number,
    progress: task.status === "done" ? 100 : task.status === "in_progress" ? 50 : undefined,
  },
});

const mapRoadmapTasksToEdges = (tasks: RoadmapTaskItem[]): Edge[] =>
  tasks.slice(1).map((task, index) => {
    const previous = tasks[index];
    const color = task.status === "done" ? "#10b981" : task.status === "in_progress" ? "#0ea5e9" : "#94a3b8";
    return {
      id: `roadmap-edge-${previous.id}-${task.id}`,
      source: `roadmap-${previous.id}`,
      target: `roadmap-${task.id}`,
      type: "smoothstep",
      animated: task.status === "in_progress",
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 20, height: 20 },
      interactionWidth: 20,
      reconnectable: true,
    };
  });

const queueTaskMentionsRoadmapStep = (task: QueueTask, roadmapTask: RoadmapTaskItem) => {
  const haystack = [task.id, task.type, task.payload, task.agentId, task.nodeId, task.lastError, task.result]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const title = roadmapTask.title.trim().toLowerCase();
  return haystack.includes(roadmapTask.id.toLowerCase()) || (title.length > 2 && haystack.includes(title));
};

const mapRoadmapDetailEdges = (roadmapTasks: RoadmapTaskItem[], queueTasks: QueueTask[]): Edge[] => {
  const edges: Edge[] = [];
  roadmapTasks.forEach((roadmapTask) => {
    queueTasks.forEach((queueTask) => {
      if (!queueTaskMentionsRoadmapStep(queueTask, roadmapTask)) return;
      const color = queueTask.status === "completed" ? "#10b981" : queueTask.status === "running" ? "#eab308" : "#94a3b8";
      edges.push({
        id: `roadmap-detail-${roadmapTask.id}-${queueTask.id}`,
        source: `roadmap-${roadmapTask.id}`,
        sourceHandle: "details",
        target: queueTask.id,
        type: "smoothstep",
        label: "details",
        animated: queueTask.status === "running",
        style: { stroke: color, strokeWidth: 1.5, strokeDasharray: "5,5" },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 20, height: 20 },
        interactionWidth: 20,
        reconnectable: true,
      });
    });
  });
  return edges;
};

const buildTaskMapCanvas = (tasks: QueueTask[], roadmap: RoadmapDocument, roadmapTaskId: string | null = null) => {
  const orderedQueueTasks = [...tasks].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const selectedRoadmapTask = roadmapTaskId
    ? roadmap.tasks.find((task) => task.id === roadmapTaskId) ?? null
    : null;
  const roadmapTasks = selectedRoadmapTask ? [selectedRoadmapTask] : roadmap.tasks;
  const visibleQueueTasks = selectedRoadmapTask
    ? orderedQueueTasks.filter((task) => queueTaskMentionsRoadmapStep(task, selectedRoadmapTask))
    : orderedQueueTasks;
  return {
    nodes: [
      ...roadmapTasks.map(mapRoadmapTaskToNode),
      ...visibleQueueTasks.map(mapTaskToNode),
    ],
    edges: [
      ...mapRoadmapTasksToEdges(roadmapTasks),
      ...mapTasksToEdges(visibleQueueTasks),
      ...mapRoadmapDetailEdges(roadmapTasks, visibleQueueTasks),
    ],
  };
};

export function TaskMapPage() {
  const { apiClient } = useAppShell();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedView, setSelectedView] = useState<"graph" | "roadmap" | "logs" | "details" | "runs">("graph");
  const [v2Runs, setV2Runs] = useState<RunDTO[]>([]);
  const [queueTasks, setQueueTasks] = useState<QueueTask[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapDocument>(emptyRoadmap);
  const [selectedRoadmapTaskId, setSelectedRoadmapTaskId] = useState<string | null>(null);
  const [roadmapError, setRoadmapError] = useState<string>("");
  const [runtimeNodes, setRuntimeNodes] = useState<RuntimeNode[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [queueError, setQueueError] = useState<string>("");
  const [controlBusy, setControlBusy] = useState<string>("");
  const [nodeMenu, setNodeMenu] = useState<NodeContextMenuState>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeEditDraft, setNodeEditDraft] = useState<NodeEditDraft>({
    label: "",
    taskId: "",
    description: "",
    agent: "",
    status: "pending",
    scheduledDate: "",
  });
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      const [tasks, nodesList, agentsList] = await Promise.all([
        listQueueTasks(),
        getNodes().catch(() => ({ nodes: [] })),
        getAgentStatuses().catch(() => ({ agents: [] })),
      ]);
      setQueueTasks(tasks);
      setRuntimeNodes(nodesList.nodes);
      setAgentStatuses(agentsList.agents);
      setQueueError("");
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Task queue is unavailable.");
    }
  }, []);

  const refreshRoadmap = useCallback(async () => {
    try {
      const response = await apiClient.getRoadmapDocument();
      setRoadmap(normalizeRoadmapDocument(normalizeRoadmapResponseForTaskMap(response)));
      setRoadmapError("");
    } catch (err) {
      setRoadmapError(err instanceof Error ? err.message : "Roadmap is unavailable.");
    }
  }, [apiClient]);

  useEffect(() => {
    refreshQueue();
    const id = setInterval(refreshQueue, 10_000);
    return () => clearInterval(id);
  }, [refreshQueue]);

  useEffect(() => {
    void refreshRoadmap();
    const id = setInterval(refreshRoadmap, 30_000);
    return () => clearInterval(id);
  }, [refreshRoadmap]);

  useEffect(() => {
    const canvas = buildTaskMapCanvas(queueTasks, roadmap, selectedRoadmapTaskId);
    if (canvas.nodes.length === 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      return;
    }
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
  }, [queueTasks, roadmap, selectedRoadmapTaskId, setEdges, setNodes]);

  useEffect(() => {
    if (selectedRoadmapTaskId && !roadmap.tasks.some((task) => task.id === selectedRoadmapTaskId)) {
      setSelectedRoadmapTaskId(null);
    }
  }, [roadmap.tasks, selectedRoadmapTaskId]);

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
  const selectedRoadmapTask = selectedRoadmapTaskId
    ? roadmap.tasks.find((task) => task.id === selectedRoadmapTaskId) ?? null
    : null;
  const contextNode = nodeMenu ? nodes.find((n) => n.id === nodeMenu.nodeId) ?? null : null;
  const editingNode = editingNodeId ? nodes.find((n) => n.id === editingNodeId) ?? null : null;
  const deleteCandidateNode = deleteNodeId ? nodes.find((n) => n.id === deleteNodeId) ?? null : null;
  const selectedBackendTask = selectedNode?.data.backendTaskId
    ? queueTasks.find((task) => task.id === selectedNode.data.backendTaskId)
    : null;
  const availableAgents =
    agentStatuses.length > 0
      ? agentStatuses.map((agent) => ({
          id: agent.agentId,
          name: agent.agentId,
          provider: agent.provider ?? "runtime",
          status: agent.presenceStatus === "offline" ? "offline" : agent.activeTasks > 0 ? "working" : "online",
        }))
      : [];
  const availableNodes =
    runtimeNodes.length > 0
      ? runtimeNodes.map((node) => ({
          id: node.id,
          hostname: node.hostname || node.id,
          type: node.nodeType === "bare_metal" ? "Bare Metal" : "K8s Pod",
          status: node.status,
        }))
      : [];
  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const selected = selection?.kind === "node" && selection.id === node.id;
        return {
          ...node,
          selected,
          zIndex: selected ? 20 : node.zIndex,
        };
      }),
    [nodes, selection],
  );
  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const selected = selection?.kind === "edge" && selection.id === edge.id;
        const baseStyle = edge.style ?? {};
        return {
          ...edge,
          selected,
          style: selected
            ? {
                ...baseStyle,
                stroke: "#06b6d4",
                strokeWidth: 3,
                filter: "drop-shadow(0 0 5px rgba(6, 182, 212, 0.55))",
              }
            : baseStyle,
          markerEnd: selected
            ? { type: MarkerType.ArrowClosed, color: "#06b6d4", width: 22, height: 22 }
            : edge.markerEnd,
          animated: selected ? true : edge.animated,
        };
      }),
    [edges, selection],
  );

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
    setNodeMenu(null);
    setSelection({ kind: "node", id: node.id });
    setSelectedView("graph");
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setNodeMenu(null);
    setSelection({ kind: "edge", id: edge.id });
    setSelectedView("graph");
  }, []);

  const onPaneClick = useCallback(() => {
    setNodeMenu(null);
    setSelection(null);
  }, []);

  const openNodeMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, nodeId: string) => {
      event.preventDefault();
      if ("stopPropagation" in event) event.stopPropagation();
      setSelection({ kind: "node", id: nodeId });
      setSelectedView("graph");
      setNodeMenu({
        nodeId,
        x: Math.min(event.clientX, window.innerWidth - 220),
        y: Math.min(event.clientY, window.innerHeight - 260),
      });
    },
    [],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      openNodeMenu(event, node.id);
    },
    [openNodeMenu],
  );

  const onFlowContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const nodeElement = target?.closest(".react-flow__node");
      const nodeId = nodeElement?.getAttribute("data-id");
      if (nodeId && nodes.some((node) => node.id === nodeId)) {
        openNodeMenu(event, nodeId);
        return;
      }
      if (selection?.kind === "node" && nodes.some((node) => node.id === selection.id)) {
        openNodeMenu(event, selection.id);
      }
    },
    [nodes, openNodeMenu, selection],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      if (selection?.kind !== "node" || !nodes.some((node) => node.id === selection.id)) {
        return;
      }
      openNodeMenu(event, selection.id);
    },
    [nodes, openNodeMenu, selection],
  );

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

  const openNodeEditor = useCallback((node: Node) => {
    setNodeEditDraft({
      label: String(node.data.label ?? ""),
      taskId: String(node.data.taskId ?? ""),
      description: String(node.data.description ?? ""),
      agent: String(node.data.agent ?? ""),
      status: String(node.data.backendStatus ?? node.data.status ?? "pending"),
      scheduledDate: String(node.data.scheduledDate ?? ""),
    });
    setEditingNodeId(node.id);
    setNodeMenu(null);
  }, []);

  const applyNodeEditor = useCallback(() => {
    if (!editingNodeId) return;
    const nextStatus = taskStatusToNodeStatus(nodeEditDraft.status);
    updateNodeData(editingNodeId, {
      label: nodeEditDraft.label,
      taskId: nodeEditDraft.taskId,
      description: nodeEditDraft.description,
      agent: nodeEditDraft.agent,
      status: nextStatus,
      backendStatus: nodeEditDraft.status,
      scheduledDate: nodeEditDraft.scheduledDate,
    });
    setEditingNodeId(null);
  }, [editingNodeId, nodeEditDraft, updateNodeData]);

  const duplicateNode = useCallback(
    (node: Node) => {
      const id = `node-${++nodeIdCounter}`;
      setNodes((nds) => [
        ...nds,
        {
          ...node,
          id,
          selected: false,
          position: { x: node.position.x + 40, y: node.position.y + 40 },
          data: {
            ...node.data,
            label: `${String(node.data.label ?? "Node")} copy`,
            backendTaskId: undefined,
          },
        },
      ]);
      setSelection({ kind: "node", id });
      setNodeMenu(null);
    },
    [setNodes],
  );

  const requestDeleteNode = useCallback((nodeId: string) => {
    setDeleteNodeId(nodeId);
    setNodeMenu(null);
  }, []);

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
      if (type !== "decision") {
        setControlBusy("create");
        createQueueTask({
          type: type === "agent" ? "manual-task" : "manual-action",
          payload: JSON.stringify({ label: type === "agent" ? "New Task" : "New Action" }),
          queue: "default",
        })
          .then(refreshQueue)
          .catch((err) => setQueueError(err instanceof Error ? err.message : "Unable to create task."))
          .finally(() => setControlBusy(""));
        return;
      }
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
    [refreshQueue, setNodes],
  );

  const runTaskControl = useCallback(
    async (task: QueueTask | null | undefined, preferredNodeId?: string, preferredAgentId?: string) => {
      if (!task) return;
      const nodeId = preferredNodeId || task.nodeId || runtimeNodes.find((node) => node.status === "online")?.id || runtimeNodes[0]?.id || "";
      if (!nodeId) {
        setQueueError("Register a runtime node before starting this task.");
        return;
      }
      setControlBusy(task.id);
      try {
        let current = task;
        if (current.status === "pending") {
          current = await claimQueueTaskById(current.id, nodeId, preferredAgentId);
        }
        if (current.status === "claimed") {
          await startQueueTask(current.id, current.nodeId || nodeId);
        }
        await refreshQueue();
      } catch (err) {
        setQueueError(err instanceof Error ? err.message : "Unable to start task.");
      } finally {
        setControlBusy("");
      }
    },
    [refreshQueue, runtimeNodes],
  );

  const finishTaskControl = useCallback(
    async (task: QueueTask | null | undefined, mode: "ack" | "nack" | "cancel") => {
      if (!task) return;
      setControlBusy(task.id);
      try {
        if (mode === "ack") {
          await ackQueueTask(task.id, task.nodeId, JSON.stringify({ completedFrom: "taskmap" }));
        } else if (mode === "nack") {
          await nackQueueTask(task.id, task.nodeId, "Marked failed from task map");
        } else {
          await cancelQueueTask(task.id);
        }
        await refreshQueue();
      } catch (err) {
        setQueueError(err instanceof Error ? err.message : "Unable to update task.");
      } finally {
        setControlBusy("");
      }
    },
    [refreshQueue],
  );

  const assignTaskAgent = useCallback(
    async (nodeId: string, agentId: string) => {
      if (!nodeId) {
        updateNodeData(selectedNode?.id ?? "", { agent: agentId, agentId });
        setQueueError("Select a runtime node before assigning an agent.");
        return;
      }
      setControlBusy("assign-agent");
      try {
        await assignAgentToNode(nodeId, { memberId: agentId });
        await refreshQueue();
      } catch (err) {
        setQueueError(err instanceof Error ? err.message : "Unable to assign agent to node.");
      } finally {
        setControlBusy("");
      }
    },
    [refreshQueue, selectedNode?.id, updateNodeData],
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
  const progressPercentage = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;
  const roadmapDone = roadmap.tasks.filter((task) => task.status === "done").length;
  const roadmapRunning = roadmap.tasks.filter((task) => task.status === "in_progress").length;
  const roadmapBlocked = roadmap.tasks.filter((task) => task.status === "blocked").length;
  const roadmapProgress = roadmap.tasks.length > 0 ? Math.round((roadmapDone / roadmap.tasks.length) * 100) : 0;
  const selectRoadmapScope = (task: RoadmapTaskItem | null) => {
    setSelectedRoadmapTaskId(task?.id ?? null);
    setNodeMenu(null);
    setSelectedView("graph");
    setSelection(task ? { kind: "node", id: `roadmap-${task.id}` } : null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold app-text-strong">Task Map</h1>
            <Badge variant="outline" className="text-[10px]">Queue-backed</Badge>
            <Badge variant="outline" className="text-[10px]">Roadmap merged</Badge>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Map size={14} className="app-accent-text" />
                <span className="font-semibold app-text-strong">{roadmap.tasks.length}</span>
                <span className="app-text-faint">steps</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
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

            <Button variant="outline" size="sm" className="h-8" onClick={refreshQueue} disabled={Boolean(controlBusy)}>
              <RotateCcw size={14} className="mr-1" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => runTaskControl(selectedBackendTask, String(selectedNode?.data.nodeId ?? ""), String(selectedNode?.data.agentId ?? ""))}
              disabled={!selectedBackendTask || Boolean(controlBusy)}
            >
              <Play size={14} className="mr-1" />
              Start
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
        {/* Roadmap Scope */}
        <div className="w-[280px] app-surface-strong border-r app-border-subtle flex flex-col">
          <div className="px-4 py-3 border-b app-border-subtle">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold app-text-strong">Roadmap</h2>
                <p className="text-xs app-text-faint mt-0.5">
                  {selectedRoadmapTask ? "Scoped task map" : "All work content"}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => selectRoadmapScope(null)}>
                All
              </Button>
            </div>
            {roadmapError && (
              <p className="mt-2 text-[11px] text-red-600">{roadmapError}</p>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              <button
                type="button"
                onClick={() => selectRoadmapScope(null)}
                className={`w-full rounded-md border p-3 text-left transition-all ${
                  selectedRoadmapTaskId === null
                    ? "border-cyan-400 bg-cyan-50/80 dark:bg-cyan-950/20 shadow-sm"
                    : "app-border-subtle hover:app-surface-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold app-text-strong">All work</span>
                  <Badge variant="outline" className="text-[10px]">{queueTasks.length} tasks</Badge>
                </div>
                <p className="mt-1 text-[10px] app-text-faint">
                  Shows every roadmap step and queue-backed task on one canvas.
                </p>
              </button>

              {roadmap.tasks.length === 0 ? (
                <Card className="p-4 text-center">
                  <Map size={22} className="app-text-faint mx-auto mb-2" />
                  <p className="text-xs app-text-faint">No roadmap steps from the backend.</p>
                </Card>
              ) : (
                roadmap.tasks.map((task) => {
                  const linkedMicroTasks = queueTasks.filter((queueTask) => queueTaskMentionsRoadmapStep(queueTask, task));
                  const isActive = selectedRoadmapTaskId === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => selectRoadmapScope(task)}
                      className={`w-full rounded-md border p-3 text-left transition-all ${
                        isActive
                          ? "border-cyan-400 bg-cyan-50/80 dark:bg-cyan-950/20 shadow-sm"
                          : "app-border-subtle hover:app-surface-strong"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] app-text-faint">Step {task.number}</div>
                          <div className="text-xs font-semibold app-text-strong truncate">{task.title || task.id}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${roadmapStatusClass(task.status)}`}>
                          {task.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] app-text-faint">
                        <span>{linkedMicroTasks.length} micro tasks</span>
                        {task.dueAt ? <span>Due {task.dueAt}</span> : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Flow Graph */}
        <div className="flex-1 relative" onContextMenu={onFlowContextMenu}>
          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
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
                <div className="text-xs font-semibold app-text-strong mb-2">
                  {selectedRoadmapTask ? "Roadmap Step Task Map" : "Roadmap Workflow"}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch size={14} className="app-accent-text" />
                  <span className="text-xs app-text-strong max-w-[260px] truncate">
                    {selectedRoadmapTask?.title || roadmap.objective || "Queue-backed delivery graph"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <FileCode size={14} className="app-text-muted" />
                  <span className="text-xs app-text-faint">{roadmapProgress}% roadmap complete</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={14} className="app-text-muted" />
                  <div className="flex -space-x-2">
                    {(agentStatuses.length > 0 ? agentStatuses.map((agent) => agent.agentId) : ["Agents"]).slice(0, 4).map((agent, i) => (
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
          {contextNode && nodeMenu && (
            <div
              className="fixed z-50 w-56 rounded-md border app-border-subtle app-surface-strong shadow-xl p-1"
              style={{ left: nodeMenu.x, top: nodeMenu.y }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="px-2 py-1.5 border-b app-border-subtle mb-1">
                <div className="text-xs font-semibold app-text-strong truncate">
                  {String(contextNode.data.label ?? contextNode.id)}
                </div>
                <div className="text-[10px] font-mono app-text-faint truncate">{contextNode.id}</div>
              </div>
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs app-text-strong hover:app-surface-strong text-left"
                onClick={() => openNodeEditor(contextNode)}
              >
                <Pencil size={13} />
                Edit node
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs app-text-strong hover:app-surface-strong text-left"
                onClick={() => {
                  setSelection({ kind: "node", id: contextNode.id });
                  setSelectedView("graph");
                  setNodeMenu(null);
                }}
              >
                <Settings size={13} />
                Open details
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs app-text-strong hover:app-surface-strong text-left"
                onClick={() => duplicateNode(contextNode)}
              >
                <Copy size={13} />
                Duplicate
              </button>
              <div className="my-1 h-px bg-gray-200 dark:bg-gray-800" />
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs app-text-strong hover:app-surface-strong text-left disabled:opacity-50"
                disabled={!contextNode.data.backendTaskId || Boolean(controlBusy)}
                onClick={() => {
                  const task = queueTasks.find((item) => item.id === contextNode.data.backendTaskId);
                  void runTaskControl(task, String(contextNode.data.nodeId ?? ""), String(contextNode.data.agentId ?? ""));
                  setNodeMenu(null);
                }}
              >
                <Play size={13} />
                Claim & start
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs app-text-strong hover:app-surface-strong text-left disabled:opacity-50"
                disabled={!contextNode.data.backendTaskId || Boolean(controlBusy)}
                onClick={() => {
                  const task = queueTasks.find((item) => item.id === contextNode.data.backendTaskId);
                  void finishTaskControl(task, "ack");
                  setNodeMenu(null);
                }}
              >
                <CheckCircle size={13} />
                Mark completed
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs app-text-strong hover:app-surface-strong text-left disabled:opacity-50"
                disabled={!contextNode.data.backendTaskId || Boolean(controlBusy)}
                onClick={() => {
                  const task = queueTasks.find((item) => item.id === contextNode.data.backendTaskId);
                  void finishTaskControl(task, "nack");
                  setNodeMenu(null);
                }}
              >
                <AlertCircle size={13} />
                Mark failed
              </button>
              <div className="my-1 h-px bg-gray-200 dark:bg-gray-800" />
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-left"
                onClick={() => requestDeleteNode(contextNode.id)}
              >
                <Trash2 size={13} />
                {contextNode.data.backendTaskId ? "Cancel task" : "Delete node"}
              </button>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-[360px] app-surface-strong border-l app-border-subtle flex flex-col">
          <div className="border-b app-border-subtle px-4 py-3">
            <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as typeof selectedView)}>
              <TabsList className="w-full grid grid-cols-5">
                <TabsTrigger value="graph" className="text-xs">Details</TabsTrigger>
                <TabsTrigger value="roadmap" className="text-xs">Roadmap</TabsTrigger>
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

                    {selectedNode.type === "roadmap" && (
                      <Card className="p-3 space-y-2.5">
                        <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider">Macro step</div>
                        <div>
                          <Label className="text-[11px] app-text-faint">Roadmap Title</Label>
                          <div className="mt-1 text-sm font-semibold app-text-strong">
                            {String(selectedNode.data.label ?? selectedNode.id)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="app-text-faint">Status</div>
                            <div className="font-medium app-text-strong">{String(selectedNode.data.roadmapStatus ?? "todo")}</div>
                          </div>
                          <div>
                            <div className="app-text-faint">Step</div>
                            <div className="font-medium app-text-strong">{String(selectedNode.data.number ?? "")}</div>
                          </div>
                        </div>
                        <p className="text-xs app-text-faint">
                          This macro node comes from the roadmap document. Queue nodes below it are the micro execution details when their payload or title links back to this step.
                        </p>
                      </Card>
                    )}

                    {/* ─ Identity ─ */}
                    {selectedNode.type !== "roadmap" && (() => {
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
                    {selectedNode.type !== "decision" && selectedNode.type !== "roadmap" && (() => {
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
                              value={(selectedNode.data.agentId as string) || ""}
                              onValueChange={(v) => {
                                updateNodeData(selectedNode.id, { agent: v, agentId: v });
                                if (selectedNode.data.backendTaskId) {
                                  void assignTaskAgent(String(selectedNode.data.nodeId ?? selectedNode.data.node ?? ""), v);
                                }
                              }}
                              disabled={done}
                            >
                              <SelectTrigger className="h-8 text-sm mt-1">
                                <SelectValue placeholder="Select agent" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableAgents.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
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
                              value={(selectedNode.data.nodeId as string) || (selectedNode.data.node as string) || ""}
                              onValueChange={(v) => {
                                const runtimeNode = runtimeNodes.find((node) => node.id === v);
                                updateNodeData(selectedNode.id, { nodeId: v, node: runtimeNode?.hostname ?? v });
                              }}
                              disabled={done}
                            >
                              <SelectTrigger className="h-8 text-sm mt-1 font-mono">
                                <SelectValue placeholder="Select node" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableNodes.map((n) => (
                                  <SelectItem key={n.id} value={n.id}>
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
                                value={(selectedNode.data.backendStatus as string) || (selectedNode.data.status as string) || "pending"}
                                onValueChange={(v) => {
                                  if (!selectedBackendTask) {
                                    updateNodeData(selectedNode.id, { status: v });
                                    return;
                                  }
                                  if (v === "running" || v === "claimed") {
                                    void runTaskControl(selectedBackendTask, String(selectedNode.data.nodeId ?? ""), String(selectedNode.data.agentId ?? ""));
                                  } else if (v === "completed") {
                                    void finishTaskControl(selectedBackendTask, "ack");
                                  } else if (v === "failed") {
                                    void finishTaskControl(selectedBackendTask, "nack");
                                  } else if (v === "cancelled") {
                                    void finishTaskControl(selectedBackendTask, "cancel");
                                  }
                                }}
                                disabled={Boolean(controlBusy)}
                              >
                                <SelectTrigger className="h-8 text-sm mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="claimed">Claimed</SelectItem>
                                  <SelectItem value="running">Running</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="failed">Failed</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </Card>
                      );
                    })()}

                    {/* ─ Schedule & Timing ─ */}
                    {selectedNode.type !== "roadmap" && (() => {
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
                      {queueError && (
                        <Card className="p-3 border-red-200 bg-red-50 dark:bg-red-950/20">
                          <p className="text-xs text-red-600">{queueError}</p>
                        </Card>
                      )}
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <Terminal size={12} className="mr-2" />
                        View Logs
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => runTaskControl(selectedBackendTask, String(selectedNode.data.nodeId ?? ""), String(selectedNode.data.agentId ?? ""))}
                        disabled={!selectedBackendTask || Boolean(controlBusy)}
                      >
                        <Play size={12} className="mr-2" />
                        Claim & Start
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => finishTaskControl(selectedBackendTask, "ack")}
                        disabled={!selectedBackendTask || selectedBackendTask.status !== "running" || Boolean(controlBusy)}
                      >
                        <CheckCircle size={12} className="mr-2" />
                        Mark Completed
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => finishTaskControl(selectedBackendTask, "nack")}
                        disabled={!selectedBackendTask || selectedBackendTask.status !== "running" || Boolean(controlBusy)}
                      >
                        <AlertCircle size={12} className="mr-2" />
                        Mark Failed
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={refreshQueue}
                        disabled={Boolean(controlBusy)}
                      >
                        <RotateCcw size={12} className="mr-2" />
                        Refresh Node
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-red-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => {
                          if (selectedBackendTask) {
                            void finishTaskControl(selectedBackendTask, "cancel");
                          } else {
                            deleteNode(selectedNode.id);
                          }
                        }}
                        disabled={Boolean(controlBusy)}
                      >
                        <Trash2 size={12} className="mr-2" />
                        {selectedBackendTask ? "Cancel Task" : "Delete Node"}
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

            {selectedView === "roadmap" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold app-text-strong">Roadmap</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refreshRoadmap}>
                    <RotateCcw size={12} className="mr-1" />
                    Refresh
                  </Button>
                </div>

                {roadmapError && (
                  <Card className="p-3 border-red-200 bg-red-50 dark:bg-red-950/20">
                    <p className="text-xs text-red-600">{roadmapError}</p>
                  </Card>
                )}

                <Card className="p-3 space-y-3">
                  <div>
                    <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider">Objective</div>
                    <p className="mt-1 text-xs app-text-strong">
                      {roadmap.objective || "No roadmap objective has been set."}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] app-text-faint mb-1">
                      <span>Overall progress</span>
                      <span>{roadmapDone}/{roadmap.tasks.length} done</span>
                    </div>
                    <Progress value={roadmapProgress} className="h-1.5" />
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div className="rounded border app-border-subtle p-2">
                        <div className="text-sm font-semibold text-sky-600">{roadmapRunning}</div>
                        <div className="text-[10px] app-text-faint">active</div>
                      </div>
                      <div className="rounded border app-border-subtle p-2">
                        <div className="text-sm font-semibold text-green-600">{roadmapDone}</div>
                        <div className="text-[10px] app-text-faint">done</div>
                      </div>
                      <div className="rounded border app-border-subtle p-2">
                        <div className="text-sm font-semibold text-red-600">{roadmapBlocked}</div>
                        <div className="text-[10px] app-text-faint">blocked</div>
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="space-y-2">
                  {roadmap.tasks.length === 0 ? (
                    <Card className="p-4 text-center">
                      <Map size={24} className="app-text-faint mx-auto mb-2" />
                      <p className="text-xs app-text-faint">No roadmap steps from the backend.</p>
                    </Card>
                  ) : (
                    roadmap.tasks.map((task) => {
                      const linkedMicroTasks = queueTasks.filter((queueTask) => queueTaskMentionsRoadmapStep(queueTask, task));
                      return (
                        <Card key={task.id} className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] app-text-faint">Step {task.number}</div>
                              <div className="text-xs font-semibold app-text-strong truncate">{task.title || task.id}</div>
                            </div>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${roadmapStatusClass(task.status)}`}>
                              {task.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] app-text-faint">
                            <span>{linkedMicroTasks.length} micro tasks on canvas</span>
                            {task.dueAt ? <span>Due {task.dueAt}</span> : null}
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
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
      <Dialog open={Boolean(editingNode)} onOpenChange={(open) => !open && setEditingNodeId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit node</DialogTitle>
            <DialogDescription>
              Update the selected task map node. Queue-backed edits are visual until the next queue refresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs app-text-faint">Label</Label>
              <Input
                value={nodeEditDraft.label}
                onChange={(event) => setNodeEditDraft((draft) => ({ ...draft, label: event.target.value }))}
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs app-text-faint">Task ID</Label>
              <Input
                value={nodeEditDraft.taskId}
                onChange={(event) => setNodeEditDraft((draft) => ({ ...draft, taskId: event.target.value }))}
                className="h-8 text-sm mt-1 font-mono"
              />
            </div>
            {editingNode?.type === "action" && (
              <div>
                <Label className="text-xs app-text-faint">Description</Label>
                <Input
                  value={nodeEditDraft.description}
                  onChange={(event) => setNodeEditDraft((draft) => ({ ...draft, description: event.target.value }))}
                  className="h-8 text-sm mt-1"
                />
              </div>
            )}
            {editingNode?.type !== "decision" && (
              <>
                <div>
                  <Label className="text-xs app-text-faint">Agent</Label>
                  <Input
                    value={nodeEditDraft.agent}
                    onChange={(event) => setNodeEditDraft((draft) => ({ ...draft, agent: event.target.value }))}
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs app-text-faint">Status</Label>
                  <Select
                    value={nodeEditDraft.status}
                    onValueChange={(value) => setNodeEditDraft((draft) => ({ ...draft, status: value }))}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="claimed">Claimed</SelectItem>
                      <SelectItem value="running">Running</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label className="text-xs app-text-faint">Scheduled Date</Label>
              <Input
                type="date"
                value={nodeEditDraft.scheduledDate}
                onChange={(event) => setNodeEditDraft((draft) => ({ ...draft, scheduledDate: event.target.value }))}
                className="h-8 text-sm mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNodeId(null)}>
              Cancel
            </Button>
            <Button onClick={applyNodeEditor}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteCandidateNode)}
        onOpenChange={(open) => !open && setDeleteNodeId(null)}
        title={deleteCandidateNode?.data.backendTaskId ? "Cancel task?" : "Delete node?"}
        description={
          deleteCandidateNode?.data.backendTaskId
            ? "This cancels the queue task for this node and refreshes the task map."
            : "This removes the node and its connected edges from the current task map."
        }
        variant="destructive"
        confirmLabel={deleteCandidateNode?.data.backendTaskId ? "Cancel task" : "Delete node"}
        onConfirm={() => {
          if (!deleteCandidateNode) return;
          const backendTaskId = deleteCandidateNode.data.backendTaskId;
          if (backendTaskId) {
            const task = queueTasks.find((item) => item.id === backendTaskId);
            void finishTaskControl(task, "cancel");
          } else {
            deleteNode(deleteCandidateNode.id);
          }
          setDeleteNodeId(null);
        }}
      />
    </div>
  );
}
