import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  Search,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plus,
  Download,
  Settings,
  Play,
  ExternalLink,
  Copy,
  User,
  Globe,
  Server,
  Terminal,
  Eye,
  MoreVertical,
  RefreshCw,
  Zap,
  Database,
} from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { PixelAvatar } from "@/components/ui/pixel-avatar";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Workspace {
  id: string;
  name: string;
  description: string;
  repository: string;
  branch: string;
  status: "running" | "stopped" | "deploying" | "error";
  lastCommit: { hash: string; message: string; author: string; time: string };
  endpoints: {
    frontend?: { url: string; status: "online" | "offline"; port: number };
    backend?: { url: string; status: "online" | "offline"; port: number };
    database?: { url: string; status: "online" | "offline"; port: number };
  };
  team: string[];
}

interface FileNode {
  id: string;
  name: string;
  type: "folder" | "file";
  path: string;
  size?: string;
  modified?: string;
  children?: FileNode[];
}

interface CommitEntry {
  hash: string;
  message: string;
  author: string;
  avatar: string;
  time: string;
  additions: number;
  deletions: number;
  files: number;
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

const mockWorkspaces: Workspace[] = [
  {
    id: "ws-1",
    name: "open-kraken-frontend",
    description: "React + TypeScript dashboard for Open Kraken",
    repository: "github.com/open-kraken/frontend",
    branch: "main",
    status: "running",
    lastCommit: { hash: "a3f9c21", message: "feat: Add task map visualization", author: "Gemini FE", time: "5 min ago" },
    endpoints: {
      frontend: { url: "http://frontend.kraken.local:3000", status: "online", port: 3000 },
    },
    team: ["Gemini FE", "Claude BE"],
  },
  {
    id: "ws-2",
    name: "open-kraken-backend",
    description: "Node.js API server with GraphQL",
    repository: "github.com/open-kraken/backend",
    branch: "develop",
    status: "running",
    lastCommit: { hash: "b7e4d12", message: "fix: Update agent orchestration logic", author: "Claude BE", time: "15 min ago" },
    endpoints: {
      backend: { url: "http://api.kraken.local:4000", status: "online", port: 4000 },
      database: { url: "postgres://db.kraken.local:5432", status: "online", port: 5432 },
    },
    team: ["Claude BE", "GPT-4 QA"],
  },
  {
    id: "ws-3",
    name: "open-kraken-ai-workers",
    description: "Python workers for AI task execution",
    repository: "github.com/open-kraken/ai-workers",
    branch: "feature/langchain-integration",
    status: "deploying",
    lastCommit: { hash: "c9a2f45", message: "chore: Upgrade LangChain to v0.3", author: "Claude BE", time: "1 hour ago" },
    endpoints: {
      backend: { url: "http://workers.kraken.local:8000", status: "offline", port: 8000 },
    },
    team: ["Claude BE"],
  },
];

const mockFileTree: FileNode[] = [
  {
    id: "src",
    name: "src",
    type: "folder",
    path: "/src",
    children: [
      {
        id: "src-app",
        name: "app",
        type: "folder",
        path: "/src/app",
        children: [
          { id: "app-tsx", name: "App.tsx", type: "file", path: "/src/app/App.tsx", size: "3.2 KB", modified: "5 min ago" },
          { id: "routes-tsx", name: "routes.tsx", type: "file", path: "/src/app/routes.tsx", size: "2.1 KB", modified: "10 min ago" },
        ],
      },
      {
        id: "src-components",
        name: "components",
        type: "folder",
        path: "/src/components",
        children: [
          { id: "shell-tsx", name: "Shell.tsx", type: "file", path: "/src/components/Shell.tsx", size: "5.8 KB", modified: "1 hour ago" },
        ],
      },
      {
        id: "src-pages",
        name: "pages",
        type: "folder",
        path: "/src/pages",
        children: [
          { id: "taskmap-tsx", name: "TaskMapPage.tsx", type: "file", path: "/src/pages/TaskMapPage.tsx", size: "12.4 KB", modified: "5 min ago" },
          { id: "skills-tsx", name: "SkillsPage.tsx", type: "file", path: "/src/pages/SkillsPage.tsx", size: "8.9 KB", modified: "2 hours ago" },
        ],
      },
    ],
  },
  { id: "package-json", name: "package.json", type: "file", path: "/package.json", size: "1.8 KB", modified: "1 day ago" },
  { id: "readme", name: "README.md", type: "file", path: "/README.md", size: "4.2 KB", modified: "2 days ago" },
];

const mockCommits: CommitEntry[] = [
  { hash: "a3f9c21", message: "feat: Add task map visualization with React Flow", author: "Gemini FE", avatar: "G", time: "5 min ago", additions: 234, deletions: 12, files: 3 },
  { hash: "f2e8b43", message: "refactor: Update skills page with tree structure", author: "Gemini FE", avatar: "G", time: "2 hours ago", additions: 456, deletions: 89, files: 2 },
  { hash: "d1c4a92", message: "fix: Resolve routing issues in Shell component", author: "Claude BE", avatar: "C", time: "1 day ago", additions: 23, deletions: 45, files: 1 },
  { hash: "b9f3e71", message: "docs: Update README with deployment instructions", author: "GPT-4 QA", avatar: "G", time: "2 days ago", additions: 67, deletions: 8, files: 1 },
  { hash: "a7d2c58", message: "chore: Upgrade dependencies to latest versions", author: "Claude BE", avatar: "C", time: "3 days ago", additions: 12, deletions: 12, files: 1 },
];

/* ------------------------------------------------------------------ */
/*  File tree component                                               */
/* ------------------------------------------------------------------ */

function FileTreeNode({
  node,
  level = 0,
  onSelectFile,
}: {
  node: FileNode;
  level?: number;
  onSelectFile: (file: FileNode) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const isFolder = node.type === "folder";

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:app-surface-strong transition-colors"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (isFolder) setIsExpanded(!isExpanded);
          else onSelectFile(node);
        }}
      >
        {isFolder ? (
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            {isExpanded ? (
              <ChevronDown size={12} className="app-text-muted" />
            ) : (
              <ChevronRight size={12} className="app-text-muted" />
            )}
          </div>
        ) : (
          <div className="w-4 shrink-0" />
        )}
        {isFolder ? (
          isExpanded ? (
            <FolderOpen size={14} className="text-blue-600 shrink-0" />
          ) : (
            <Folder size={14} className="text-blue-600 shrink-0" />
          )
        ) : (
          <FileCode size={14} className="app-text-muted shrink-0" />
        )}
        <span className="flex-1 text-xs app-text-strong truncate">{node.name}</span>
        {!isFolder && node.size && (
          <span className="text-[10px] app-text-faint shrink-0">{node.size}</span>
        )}
      </div>
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.id} node={child} level={level + 1} onSelectFile={onSelectFile} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export function WorkspacesPage() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace>(mockWorkspaces[0]);
  const [, setSelectedFile] = useState<FileNode | null>(null);
  const [selectedTab, setSelectedTab] = useState<"files" | "commits" | "branches">("files");

  const getStatusColor = (status: Workspace["status"]) => {
    switch (status) {
      case "running":
        return "success" as const;
      case "deploying":
        return "warning" as const;
      case "error":
        return "error" as const;
      default:
        return "idle" as const;
    }
  };

  const getEndpointStatus = (status: "online" | "offline") => {
    return status === "online" ? ("success" as const) : ("error" as const);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold app-text-strong">Workspaces</h1>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Folder size={14} className="app-text-muted" />
                <span className="font-semibold app-text-strong">{mockWorkspaces.length}</span>
                <span className="app-text-faint">projects</span>
              </div>
              <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <Zap size={14} className="text-green-600" />
                <span className="font-semibold text-green-600">
                  {mockWorkspaces.filter((w) => w.status === "running").length}
                </span>
                <span className="app-text-faint">running</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8">
              <Download size={14} className="mr-1" />
              Clone
            </Button>
            <Button size="sm" className="h-8">
              <Plus size={14} className="mr-1" />
              New Workspace
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[280px] app-surface-strong border-r app-border-subtle flex flex-col">
          <div className="p-4 border-b app-border-subtle">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint" />
              <Input placeholder="Search workspaces..." className="pl-9 h-9 text-sm" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {mockWorkspaces.map((workspace) => (
                <Card
                  key={workspace.id}
                  className={`p-3 cursor-pointer hover:app-surface-strong transition-colors ${
                    selectedWorkspace.id === workspace.id
                      ? "app-surface-strong ring-1 ring-gray-300 dark:ring-gray-700"
                      : ""
                  }`}
                  onClick={() => setSelectedWorkspace(workspace)}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Folder size={16} className="text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs app-text-strong truncate mb-1">
                        {workspace.name}
                      </div>
                      <div className="text-[10px] app-text-faint line-clamp-2">
                        {workspace.description}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot status={getStatusColor(workspace.status)} />
                    <span className="text-[10px] app-text-faint capitalize">{workspace.status}</span>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Workspace Header */}
          <div className="app-surface-strong border-b app-border-subtle px-6 py-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold">
                  {selectedWorkspace.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold app-text-strong mb-1">{selectedWorkspace.name}</h2>
                  <p className="text-xs app-text-muted mb-2">{selectedWorkspace.description}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-5">
                      <GitBranch size={10} className="mr-1" />
                      {selectedWorkspace.branch}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-5">
                      <StatusDot status={getStatusColor(selectedWorkspace.status)} />
                      {selectedWorkspace.status}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Settings size={14} className="mr-1" />
                  Settings
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Download size={14} className="mr-2" />
                      Clone Repository
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <GitPullRequest size={14} className="mr-2" />
                      Create Pull Request
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Terminal size={14} className="mr-2" />
                      Open Terminal
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Last Commit */}
            <Card className="p-3 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center gap-3">
                <PixelAvatar name={selectedWorkspace.lastCommit.author} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold app-text-strong truncate">
                    {selectedWorkspace.lastCommit.message}
                  </div>
                  <div className="text-[10px] app-text-faint">
                    {selectedWorkspace.lastCommit.author} committed {selectedWorkspace.lastCommit.time}
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] h-5 shrink-0">
                  {selectedWorkspace.lastCommit.hash}
                </Badge>
              </div>
            </Card>
          </div>

          {/* Tabs */}
          <div className="border-b app-border-subtle px-6">
            <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as typeof selectedTab)}>
              <TabsList className="h-10">
                <TabsTrigger value="files" className="text-xs">
                  <FileCode size={14} className="mr-1" />
                  Files
                </TabsTrigger>
                <TabsTrigger value="commits" className="text-xs">
                  <GitCommit size={14} className="mr-1" />
                  Commits
                </TabsTrigger>
                <TabsTrigger value="branches" className="text-xs">
                  <GitBranch size={14} className="mr-1" />
                  Branches
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Tab Content */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {selectedTab === "files" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold app-text-strong">Repository Files</div>
                    <div className="text-xs app-text-faint">
                      {mockCommits.length} commits &middot; {selectedWorkspace.branch} branch
                    </div>
                  </div>
                  <Card className="overflow-hidden">
                    <div className="p-2">
                      {mockFileTree.map((node) => (
                        <FileTreeNode key={node.id} node={node} onSelectFile={setSelectedFile} />
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {selectedTab === "commits" && (
                <div className="space-y-3">
                  {mockCommits.map((commit) => (
                    <Card key={commit.hash} className="p-4">
                      <div className="flex items-start gap-3">
                        <PixelAvatar name={commit.author} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm app-text-strong mb-1">
                            {commit.message}
                          </div>
                          <div className="flex items-center gap-3 text-xs app-text-faint mb-2">
                            <span>{commit.author}</span>
                            <span>&middot;</span>
                            <span>{commit.time}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <Badge variant="outline" className="text-[10px] h-5 font-mono">
                              {commit.hash}
                            </Badge>
                            <div className="flex items-center gap-1 text-green-600">
                              <span>+{commit.additions}</span>
                            </div>
                            <div className="flex items-center gap-1 text-red-600">
                              <span>-{commit.deletions}</span>
                            </div>
                            <div className="app-text-faint">
                              {commit.files} {commit.files === 1 ? "file" : "files"} changed
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Eye size={14} className="mr-1" />
                          View
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {selectedTab === "branches" && (
                <div className="space-y-3">
                  <Card className="p-4 ring-2 ring-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GitBranch size={16} className="text-green-600" />
                        <div>
                          <div className="text-sm font-semibold app-text-strong">main</div>
                          <div className="text-xs app-text-faint">Default branch &middot; Protected</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                        Current
                      </Badge>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GitBranch size={16} className="app-text-muted" />
                        <div>
                          <div className="text-sm font-semibold app-text-strong">develop</div>
                          <div className="text-xs app-text-faint">2 commits ahead of main</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Switch</Button>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GitBranch size={16} className="app-text-muted" />
                        <div>
                          <div className="text-sm font-semibold app-text-strong">
                            feature/task-visualization
                          </div>
                          <div className="text-xs app-text-faint">5 commits ahead of main</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Switch</Button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Sidebar - Service Endpoints */}
        <div className="w-[360px] app-surface-strong border-l app-border-subtle flex flex-col">
          <div className="p-4 border-b app-border-subtle">
            <h3 className="text-sm font-semibold app-text-strong">Service Endpoints</h3>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {selectedWorkspace.endpoints.frontend && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe size={16} className="app-accent-text" />
                    <span className="text-sm font-semibold app-text-strong">Frontend</span>
                    <StatusDot status={getEndpointStatus(selectedWorkspace.endpoints.frontend.status)} />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] app-text-faint mb-1">Internal URL</div>
                      <div className="flex items-center gap-2 p-2 rounded app-surface-strong">
                        <code className="flex-1 text-xs font-mono app-text-strong truncate">
                          {selectedWorkspace.endpoints.frontend.url}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => navigator.clipboard.writeText(selectedWorkspace.endpoints.frontend!.url)}
                        >
                          <Copy size={12} />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] app-text-faint mb-1">Port</div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {selectedWorkspace.endpoints.frontend.port}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => window.open(selectedWorkspace.endpoints.frontend!.url, "_blank")}
                      >
                        <ExternalLink size={14} className="mr-1" />
                        Open
                      </Button>
                      <Button variant="outline" size="sm">
                        <RefreshCw size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {selectedWorkspace.endpoints.backend && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Server size={16} className="text-purple-600" />
                    <span className="text-sm font-semibold app-text-strong">Backend API</span>
                    <StatusDot status={getEndpointStatus(selectedWorkspace.endpoints.backend.status)} />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] app-text-faint mb-1">Internal URL</div>
                      <div className="flex items-center gap-2 p-2 rounded app-surface-strong">
                        <code className="flex-1 text-xs font-mono app-text-strong truncate">
                          {selectedWorkspace.endpoints.backend.url}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => navigator.clipboard.writeText(selectedWorkspace.endpoints.backend!.url)}
                        >
                          <Copy size={12} />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] app-text-faint mb-1">Port</div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {selectedWorkspace.endpoints.backend.port}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => window.open(selectedWorkspace.endpoints.backend!.url, "_blank")}
                      >
                        <ExternalLink size={14} className="mr-1" />
                        Open API
                      </Button>
                      <Button variant="outline" size="sm">
                        <Terminal size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {selectedWorkspace.endpoints.database && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Database size={16} className="text-orange-600" />
                    <span className="text-sm font-semibold app-text-strong">Database</span>
                    <StatusDot status={getEndpointStatus(selectedWorkspace.endpoints.database.status)} />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] app-text-faint mb-1">Connection String</div>
                      <div className="flex items-center gap-2 p-2 rounded app-surface-strong">
                        <code className="flex-1 text-xs font-mono app-text-strong truncate">
                          {selectedWorkspace.endpoints.database.url}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => navigator.clipboard.writeText(selectedWorkspace.endpoints.database!.url)}
                        >
                          <Copy size={12} />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] app-text-faint mb-1">Port</div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {selectedWorkspace.endpoints.database.port}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" className="w-full">
                      <Terminal size={14} className="mr-1" />
                      Connect via psql
                    </Button>
                  </div>
                </Card>
              )}

              {/* Team Members */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User size={16} className="app-text-muted" />
                  <span className="text-sm font-semibold app-text-strong">Team Members</span>
                </div>
                <div className="space-y-2">
                  {selectedWorkspace.team.map((member, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <PixelAvatar name={member} size="sm" />
                      <span className="text-xs app-text-strong">{member}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Quick Actions */}
              <Card className="p-4">
                <div className="text-sm font-semibold app-text-strong mb-3">Quick Actions</div>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Play size={14} className="mr-2" />
                    Restart Services
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Terminal size={14} className="mr-2" />
                    Open Terminal
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Download size={14} className="mr-2" />
                    Download Logs
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Settings size={14} className="mr-2" />
                    Configure Env
                  </Button>
                </div>
              </Card>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
