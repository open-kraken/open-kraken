import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Plus,
  ExternalLink,
  Folder,
  GitCommit,
  Server,
} from "lucide-react";
import { PreviewRouteNotice } from "@/components/shell/PreviewRouteNotice";

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

const mockRepos = [
  {
    id: "repo_001",
    name: "backend-api",
    fullName: "kraken-workspace/backend-api",
    url: "https://github.com/kraken-workspace/backend-api",
    defaultBranch: "main",
    team: "Backend Squad",
    branches: ["main", "dev", "fix/auth-bug", "feature/new-endpoint"],
    latestCommit: { hash: "a3f2d91", message: "Fix JWT expiry handling", author: "Claude BE", time: "2h ago" },
    openPRs: 3,
    ciStatus: "passing" as const,
    workspaces: [
      { nodeId: "node_001", nodeName: "k8s-runner-01", branch: "fix/auth-bug", head: "b4e1c82", dirty: true, agent: "Claude BE" },
      { nodeId: "node_002", nodeName: "k8s-runner-02", branch: "main", head: "a3f2d91", dirty: false, agent: "Gemini QA" },
    ],
  },
  {
    id: "repo_002",
    name: "frontend-app",
    fullName: "kraken-workspace/frontend-app",
    url: "https://github.com/kraken-workspace/frontend-app",
    defaultBranch: "main",
    team: "Frontend Squad",
    branches: ["main", "dev", "redesign/dashboard"],
    latestCommit: { hash: "c8d4f12", message: "Update dashboard metrics UI", author: "Gemini FE", time: "4h ago" },
    openPRs: 1,
    ciStatus: "passing" as const,
    workspaces: [
      { nodeId: "node_003", nodeName: "bare-metal-01", branch: "redesign/dashboard", head: "c8d4f12", dirty: true, agent: "Gemini FE" },
    ],
  },
  {
    id: "repo_003",
    name: "infra-configs",
    fullName: "kraken-workspace/infra-configs",
    url: "https://github.com/kraken-workspace/infra-configs",
    defaultBranch: "main",
    team: "Workspace Team",
    branches: ["main"],
    latestCommit: { hash: "f7a3b92", message: "Update k8s deployment configs", author: "Alex", time: "1d ago" },
    openPRs: 0,
    ciStatus: "failing" as const,
    workspaces: [],
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export function RepositoriesPage() {
  const [selectedRepo, setSelectedRepo] = useState<string | null>(mockRepos[0].id);

  const repo = mockRepos.find((r) => r.id === selectedRepo);

  const totalWorkspaces = mockRepos.reduce((sum, r) => sum + r.workspaces.length, 0);
  const totalPRs = mockRepos.reduce((sum, r) => sum + r.openPRs, 0);
  const passingRepos = mockRepos.filter((r) => r.ciStatus === "passing").length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold app-text-strong">Repositories &amp; Git Workspaces</h1>
            <p className="text-sm app-text-muted mt-1">
              Manage code repositories and distributed Git execution contexts
            </p>
          </div>
          <Button className="app-accent-bg hover:opacity-90 text-white" disabled title="Preview data only">
            <Plus size={14} className="mr-1" />
            Add Repository
          </Button>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="app-text-faint">Repositories:</span>
            <span className="app-text-strong font-medium">{mockRepos.length}</span>
          </div>
          <span className="text-gray-300">&#8226;</span>
          <div className="flex items-center gap-2">
            <span className="app-text-faint">Active Workspaces:</span>
            <span className="app-text-strong font-medium">{totalWorkspaces}</span>
          </div>
          <span className="text-gray-300">&#8226;</span>
          <div className="flex items-center gap-2">
            <span className="app-text-faint">Open PRs:</span>
            <span className="app-text-strong font-medium">{totalPRs}</span>
          </div>
          <span className="text-gray-300">&#8226;</span>
          <div className="flex items-center gap-2">
            <span className="app-text-faint">CI Passing:</span>
            <span className="text-green-600 font-medium">
              {passingRepos}/{mockRepos.length}
            </span>
          </div>
        </div>
      </div>

      <PreviewRouteNotice surface="Repositories" dependency="repository connector and CI status APIs" />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Repository List */}
        <div className="w-96 border-r app-border-subtle bg-gray-50 dark:bg-gray-900 overflow-y-auto">
          <div className="p-4 space-y-2">
            {mockRepos.map((r) => (
              <Card
                key={r.id}
                className={`p-4 cursor-pointer transition-all ${
                  selectedRepo === r.id
                    ? "ring-2 ring-cyan-500 bg-white dark:bg-gray-800"
                    : "hover:bg-white dark:hover:bg-gray-800"
                }`}
                onClick={() => setSelectedRepo(r.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Folder size={16} className="flex-shrink-0 app-text-muted" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm app-text-strong truncate">{r.name}</div>
                      <div className="text-xs app-text-faint truncate">{r.fullName}</div>
                    </div>
                  </div>
                  {r.ciStatus === "passing" ? (
                    <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-red-600 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <Badge variant="outline" className="text-[10px]">{r.team}</Badge>
                  <div className="flex items-center gap-3 app-text-faint">
                    {r.openPRs > 0 && (
                      <span className="flex items-center gap-1">
                        <GitPullRequest size={10} />
                        {r.openPRs}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Server size={10} />
                      {r.workspaces.length}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Repository Detail */}
        {repo && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Repo Info */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold app-text-strong mb-1">{repo.name}</h2>
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm app-accent hover:underline flex items-center gap-1"
                  >
                    {repo.fullName}
                    <ExternalLink size={12} />
                  </a>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled title="Preview data only">
                    <GitMerge size={14} className="mr-1" />
                    Sync Remote
                  </Button>
                  <Button variant="outline" size="sm" disabled title="Preview data only">Settings</Button>
                </div>
              </div>

              {/* Latest Commit */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold app-text-strong">Latest Commit</h3>
                  <Badge variant="outline" className="text-xs">
                    <GitBranch size={10} className="mr-1" />
                    {repo.defaultBranch}
                  </Badge>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-mono flex-shrink-0">
                    {repo.latestCommit.hash.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm app-text-strong mb-1">
                      {repo.latestCommit.message}
                    </div>
                    <div className="text-xs app-text-faint">
                      by {repo.latestCommit.author} &middot; {repo.latestCommit.time}
                    </div>
                  </div>
                  <code className="text-xs app-text-muted font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {repo.latestCommit.hash}
                  </code>
                </div>
              </Card>

              {/* Branches */}
              <Card className="p-4">
                <h3 className="font-semibold app-text-strong mb-3">Branches</h3>
                <div className="flex flex-wrap gap-2">
                  {repo.branches.map((branch) => (
                    <Badge
                      key={branch}
                      variant={branch === repo.defaultBranch ? "default" : "outline"}
                      className="text-xs"
                    >
                      <GitBranch size={10} className="mr-1" />
                      {branch}
                    </Badge>
                  ))}
                </div>
              </Card>

              {/* Open Pull Requests */}
              {repo.openPRs > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold app-text-strong mb-3 flex items-center gap-2">
                    <GitPullRequest size={16} />
                    Open Pull Requests ({repo.openPRs})
                  </h3>
                  <div className="text-sm app-text-muted">
                    View PRs on{" "}
                    <a
                      href={`${repo.url}/pulls`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-accent hover:underline"
                    >
                      GitHub
                    </a>
                  </div>
                </Card>
              )}

              {/* Active Workspaces */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold app-text-strong">
                    Active Git Workspaces ({repo.workspaces.length})
                  </h3>
                  {repo.workspaces.length > 0 && (
                    <Badge variant="outline" className="text-xs app-accent">
                      {repo.workspaces.length} node{repo.workspaces.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                {repo.workspaces.length === 0 ? (
                  <div className="text-center py-8 app-text-muted text-sm">No active workspaces</div>
                ) : (
                  <div className="space-y-3">
                    {repo.workspaces.map((ws, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg border app-border-subtle bg-gray-50 dark:bg-gray-900"
                      >
                        <Server size={16} className="mt-1 app-text-muted flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm app-text-strong">{ws.nodeName}</span>
                            {ws.dirty && (
                              <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-600">
                                Dirty
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div>
                              <span className="app-text-faint">Branch:</span>{" "}
                              <code className="app-text-strong font-mono">{ws.branch}</code>
                            </div>
                            <div>
                              <span className="app-text-faint">HEAD:</span>{" "}
                              <code className="app-text-strong font-mono">{ws.head}</code>
                            </div>
                            <div>
                              <span className="app-text-faint">Agent:</span>{" "}
                              <span className="app-text-strong">{ws.agent}</span>
                            </div>
                            <div>
                              <span className="app-text-faint">Node:</span>{" "}
                              <span className="app-text-strong">{ws.nodeId}</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="flex-shrink-0">
                          <GitCommit size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* CI Status */}
              <Card className="p-4">
                <h3 className="font-semibold app-text-strong mb-3">CI/CD Status</h3>
                <div className="flex items-center gap-3">
                  {repo.ciStatus === "passing" ? (
                    <>
                      <CheckCircle2 size={20} className="text-green-600" />
                      <div>
                        <div className="text-sm font-medium text-green-600">All checks passed</div>
                        <div className="text-xs app-text-faint">Latest build successful</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle size={20} className="text-red-600" />
                      <div>
                        <div className="text-sm font-medium text-red-600">Build failing</div>
                        <div className="text-xs app-text-faint">2 tests failed</div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
