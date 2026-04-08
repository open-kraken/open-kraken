import { useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type NodeTypes,
  Panel,
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
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Custom node components                                            */
/* ------------------------------------------------------------------ */

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
    <div className={`px-4 py-3 rounded-lg border-2 ${getStatusColor()} min-w-[180px] shadow-sm`}>
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
    </div>
  );
}

function ActionNode({ data }: { data: Record<string, any> }) {
  return (
    <div className="px-3 py-2 rounded-md border border-cyan-400 bg-cyan-50 dark:bg-cyan-950/20 min-w-[140px]">
      <div className="flex items-center gap-2">
        <Code size={12} className="text-cyan-600" />
        <div className="text-xs font-medium text-cyan-700 dark:text-cyan-400">{data.label}</div>
      </div>
      {data.description && (
        <div className="text-[10px] text-cyan-600 dark:text-cyan-500 mt-1">
          {data.description}
        </div>
      )}
    </div>
  );
}

function DecisionNode({ data }: { data: Record<string, any> }) {
  return (
    <div className="w-28 h-28 rotate-45 border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center">
      <div className="-rotate-45 text-center">
        <GitBranch size={16} className="text-orange-600 mx-auto mb-1" />
        <div className="text-xs font-medium text-orange-700 dark:text-orange-400">
          {data.label}
        </div>
      </div>
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

const initialNodes: Node[] = [
  {
    id: "start",
    type: "agent",
    position: { x: 250, y: 50 },
    data: { label: "Task Initialized", status: "success", agent: "System", duration: "0.2s" },
  },
  {
    id: "code-review",
    type: "agent",
    position: { x: 250, y: 180 },
    data: { label: "Code Review", status: "success", agent: "Claude BE", duration: "3.4s", progress: 100 },
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
    data: { label: "UI Generation", status: "running", agent: "Gemini FE", duration: "2.1s", progress: 65 },
  },
  {
    id: "test-gen",
    type: "agent",
    position: { x: 400, y: 480 },
    data: { label: "Test Generation", status: "pending", agent: "GPT-4 QA" },
  },
  {
    id: "git-commit",
    type: "action",
    position: { x: 230, y: 620 },
    data: { label: "Git Commit", description: "Create PR" },
  },
  {
    id: "deploy",
    type: "action",
    position: { x: 230, y: 730 },
    data: { label: "Deploy to Staging", description: "Codex DevOps" },
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
    markerEnd: { type: "arrowclosed" as const, color: "#10b981" },
  },
  {
    id: "e2",
    source: "code-review",
    target: "decision-1",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#94a3b8", strokeWidth: 2 },
    markerEnd: { type: "arrowclosed" as const, color: "#94a3b8" },
  },
  {
    id: "e3",
    source: "decision-1",
    target: "ui-generation",
    label: "approved",
    type: "smoothstep",
    animated: true,
    style: { stroke: "#eab308", strokeWidth: 2 },
    markerEnd: { type: "arrowclosed" as const, color: "#eab308" },
    labelStyle: { fill: "#eab308", fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: "#fef3c7" },
  },
  {
    id: "e4",
    source: "decision-1",
    target: "test-gen",
    label: "parallel",
    type: "smoothstep",
    animated: true,
    style: { stroke: "#eab308", strokeWidth: 2 },
    markerEnd: { type: "arrowclosed" as const, color: "#eab308" },
    labelStyle: { fill: "#eab308", fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: "#fef3c7" },
  },
  {
    id: "e5",
    source: "ui-generation",
    target: "git-commit",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#94a3b8", strokeWidth: 2, strokeDasharray: "5,5" },
    markerEnd: { type: "arrowclosed" as const, color: "#94a3b8" },
  },
  {
    id: "e6",
    source: "test-gen",
    target: "git-commit",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#d1d5db", strokeWidth: 2, strokeDasharray: "5,5" },
    markerEnd: { type: "arrowclosed" as const, color: "#d1d5db" },
  },
  {
    id: "e7",
    source: "git-commit",
    target: "deploy",
    type: "smoothstep",
    animated: false,
    style: { stroke: "#d1d5db", strokeWidth: 2, strokeDasharray: "5,5" },
    markerEnd: { type: "arrowclosed" as const, color: "#d1d5db" },
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

export function TaskMapPage() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedView, setSelectedView] = useState<"graph" | "logs" | "details">("graph");

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

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
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
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
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="graph" className="text-xs">Details</TabsTrigger>
                <TabsTrigger value="logs" className="text-xs">Logs</TabsTrigger>
                <TabsTrigger value="details" className="text-xs">Config</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1 p-4">
            {selectedView === "graph" && (
              <div className="space-y-4">
                {selectedNode ? (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold app-text-strong mb-2">
                        {selectedNode.data.label as string}
                      </h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="app-text-faint">Status:</span>
                          <Badge
                            className={
                              selectedNode.data.status === "success"
                                ? "bg-green-50 text-green-700 border-green-300"
                                : selectedNode.data.status === "running"
                                  ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                                  : selectedNode.data.status === "error"
                                    ? "bg-red-50 text-red-700 border-red-300"
                                    : ""
                            }
                          >
                            {(selectedNode.data.status as string) || "pending"}
                          </Badge>
                        </div>
                        {(selectedNode.data.agent as string | undefined) && (
                          <div className="flex items-center justify-between">
                            <span className="app-text-faint">Agent:</span>
                            <span className="font-medium app-text-strong">
                              {selectedNode.data.agent as string}
                            </span>
                          </div>
                        )}
                        {(selectedNode.data.duration as string | undefined) && (
                          <div className="flex items-center justify-between">
                            <span className="app-text-faint">Duration:</span>
                            <span className="font-mono app-text-strong">
                              {selectedNode.data.duration as string}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedNode.data.status === "success" && (
                      <Card className="p-3 bg-green-50 dark:bg-green-950/20 border-green-200">
                        <div className="flex items-start gap-2">
                          <CheckCircle size={14} className="text-green-600 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">
                              Output
                            </div>
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
                            <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-2">
                              In Progress
                            </div>
                            <Progress value={(selectedNode.data.progress as number) || 0} className="h-1.5 mb-2" />
                            <p className="text-xs text-yellow-600 dark:text-yellow-500">
                              Generating responsive dashboard components...
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}

                    <div>
                      <h4 className="text-xs font-semibold app-text-strong mb-2">Actions</h4>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <Terminal size={12} className="mr-2" />
                          View Logs
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <RotateCcw size={12} className="mr-2" />
                          Retry Node
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <Settings size={12} className="mr-2" />
                          Configure
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Activity size={32} className="app-text-faint mx-auto mb-2" />
                    <p className="text-sm app-text-faint">Select a node to view details</p>
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
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
