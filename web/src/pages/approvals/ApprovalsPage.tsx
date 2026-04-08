import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  FileCode,
  Terminal,
  GitCommit,
  Shield,
  DollarSign,
  Key,
} from "lucide-react";

type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
type ApprovalRisk = "high" | "medium" | "low";
type ApprovalType = "deploy" | "file_write" | "shell_exec" | "git_push" | "secret_access" | "budget";

interface Approval {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  risk: ApprovalRisk;
  requester: string;
  requesterTeam: string;
  requestedAt: string;
  expiresAt: string;
  title: string;
  description: string;
  context: {
    agent?: string;
    task?: string;
    command?: string;
    file?: string;
    amount?: number;
  };
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

const mockApprovals: Approval[] = [
  {
    id: "appr_001",
    type: "deploy",
    status: "pending",
    risk: "high",
    requester: "Claude BE",
    requesterTeam: "Backend Squad",
    requestedAt: "5 min ago",
    expiresAt: "in 25 min",
    title: "Deploy to production",
    description: "Deploy backend-api v2.1.4 to production cluster",
    context: { agent: "Claude BE", task: "task_142", command: "kubectl apply -f deploy/prod.yaml" },
  },
  {
    id: "appr_002",
    type: "git_push",
    status: "pending",
    risk: "medium",
    requester: "Gemini FE",
    requesterTeam: "Frontend Squad",
    requestedAt: "12 min ago",
    expiresAt: "in 18 min",
    title: "Push to main branch",
    description: "Push dashboard redesign commits to main branch",
    context: {
      agent: "Gemini FE",
      task: "task_143",
      command: "git push origin main",
      file: "12 files changed, 384 insertions(+), 127 deletions(-)",
    },
  },
  {
    id: "appr_003",
    type: "secret_access",
    status: "pending",
    risk: "high",
    requester: "Codex DevOps",
    requesterTeam: "Workspace Team",
    requestedAt: "18 min ago",
    expiresAt: "in 12 min",
    title: "Access AWS credentials",
    description: "Access production AWS credentials for deployment",
    context: { agent: "Codex DevOps", task: "task_144", command: "Required for S3 deployment" },
  },
  {
    id: "appr_004",
    type: "file_write",
    status: "approved",
    risk: "medium",
    requester: "Qwen API",
    requesterTeam: "Backend Squad",
    requestedAt: "1h ago",
    expiresAt: "-",
    title: "Modify config file",
    description: "Update database connection pool configuration",
    context: { agent: "Qwen API", task: "task_140", file: "config/database.yaml" },
    approvedBy: "Alex",
    approvedAt: "45 min ago",
  },
  {
    id: "appr_005",
    type: "budget",
    status: "rejected",
    risk: "low",
    requester: "Claude Code",
    requesterTeam: "Backend Squad",
    requestedAt: "2h ago",
    expiresAt: "-",
    title: "Exceed budget limit",
    description: "Request to exceed $50 daily token budget",
    context: { agent: "Claude Code", amount: 62.5 },
    rejectedBy: "Alex",
    rejectedAt: "1h ago",
    rejectionReason: "Budget exceeded without justification",
  },
];

const getTypeIcon = (type: ApprovalType) => {
  switch (type) {
    case "deploy":
      return <Terminal size={16} />;
    case "file_write":
      return <FileCode size={16} />;
    case "shell_exec":
      return <Terminal size={16} />;
    case "git_push":
      return <GitCommit size={16} />;
    case "secret_access":
      return <Key size={16} />;
    case "budget":
      return <DollarSign size={16} />;
  }
};

const getRiskBadge = (risk: ApprovalRisk) => {
  switch (risk) {
    case "high":
      return (
        <Badge variant="outline" className="text-red-600 border-red-600 text-[10px]">
          <AlertTriangle size={10} className="mr-1" />
          High Risk
        </Badge>
      );
    case "medium":
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-[10px]">
          <Shield size={10} className="mr-1" />
          Medium Risk
        </Badge>
      );
    case "low":
      return (
        <Badge variant="outline" className="text-green-600 border-green-600 text-[10px]">
          <Shield size={10} className="mr-1" />
          Low Risk
        </Badge>
      );
  }
};

export function ApprovalsPage() {
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const [approveDialog, setApproveDialog] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);

  const filteredApprovals =
    filter === "all" ? mockApprovals : mockApprovals.filter((a) => a.status === filter);

  const pendingCount = mockApprovals.filter((a) => a.status === "pending").length;
  const approvedCount = mockApprovals.filter((a) => a.status === "approved").length;
  const rejectedCount = mockApprovals.filter((a) => a.status === "rejected").length;

  const handleApprove = (id: string) => {
    console.log("Approved:", id);
    setApproveDialog(null);
  };

  const handleReject = (id: string) => {
    console.log("Rejected:", id);
    setRejectDialog(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold app-text-strong">Approvals</h1>
            <p className="text-sm app-text-muted mt-1">
              Review and approve high-risk agent actions
            </p>
          </div>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-yellow-600" />
            <span className="app-text-faint">Pending:</span>
            <span className="text-yellow-600 font-medium">{pendingCount}</span>
          </div>
          <span className="text-gray-300">&#8226;</span>
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-600" />
            <span className="app-text-faint">Approved:</span>
            <span className="text-green-600 font-medium">{approvedCount}</span>
          </div>
          <span className="text-gray-300">&#8226;</span>
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-red-600" />
            <span className="app-text-faint">Rejected:</span>
            <span className="text-red-600 font-medium">{rejectedCount}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="app-bg-elevated border-b app-border-subtle px-6 py-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as ApprovalStatus | "all")}>
          <TabsList>
            <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Approvals List */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {filteredApprovals.length === 0 ? (
            <div className="text-center py-12">
              <Shield size={48} className="mx-auto app-text-faint mb-3" />
              <h3 className="font-semibold app-text-strong mb-1">No approvals</h3>
              <p className="text-sm app-text-muted">
                {filter === "pending"
                  ? "All pending approvals have been processed"
                  : `No ${filter} approvals found`}
              </p>
            </div>
          ) : (
            filteredApprovals.map((approval) => (
              <Card key={approval.id} className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center app-text-muted">
                      {getTypeIcon(approval.type)}
                    </div>
                    <div>
                      <h3 className="font-semibold app-text-strong mb-1">{approval.title}</h3>
                      <p className="text-sm app-text-muted mb-2">{approval.description}</p>
                      <div className="flex items-center gap-2">
                        {getRiskBadge(approval.risk)}
                        <Badge variant="outline" className="text-[10px]">
                          {approval.type.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {approval.status === "pending" && (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">
                      <Clock size={12} className="mr-1" />
                      Pending
                    </Badge>
                  )}
                  {approval.status === "approved" && (
                    <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                      <CheckCircle size={12} className="mr-1" />
                      Approved
                    </Badge>
                  )}
                  {approval.status === "rejected" && (
                    <Badge variant="outline" className="text-red-600 border-red-600 text-xs">
                      <XCircle size={12} className="mr-1" />
                      Rejected
                    </Badge>
                  )}
                  {approval.status === "expired" && (
                    <Badge variant="outline" className="text-gray-600 border-gray-600 text-xs">
                      Expired
                    </Badge>
                  )}
                </div>

                {/* Context */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <span className="app-text-faint">Requester:</span>{" "}
                    <span className="app-text-strong font-medium">{approval.requester}</span>
                  </div>
                  <div>
                    <span className="app-text-faint">Team:</span>{" "}
                    <span className="app-text-strong">{approval.requesterTeam}</span>
                  </div>
                  <div>
                    <span className="app-text-faint">Requested:</span>{" "}
                    <span className="app-text-strong">{approval.requestedAt}</span>
                  </div>
                  <div>
                    <span className="app-text-faint">Expires:</span>{" "}
                    <span className="app-text-strong">{approval.expiresAt}</span>
                  </div>
                </div>

                {approval.context.command && (
                  <div className="mb-4 p-3 rounded bg-gray-100 dark:bg-gray-900">
                    <div className="text-xs app-text-faint mb-1">Command:</div>
                    <code className="text-xs app-text-strong font-mono">
                      {approval.context.command}
                    </code>
                  </div>
                )}

                {approval.context.file && approval.type === "file_write" && (
                  <div className="mb-4 p-3 rounded bg-gray-100 dark:bg-gray-900">
                    <div className="text-xs app-text-faint mb-1">Target:</div>
                    <code className="text-xs app-text-strong font-mono">{approval.context.file}</code>
                  </div>
                )}

                {approval.context.file && approval.type === "git_push" && (
                  <div className="mb-4 p-3 rounded bg-gray-100 dark:bg-gray-900">
                    <div className="text-xs app-text-faint mb-1">Changes:</div>
                    <code className="text-xs app-text-strong font-mono">{approval.context.file}</code>
                  </div>
                )}

                {approval.context.amount && (
                  <div className="mb-4 p-3 rounded bg-gray-100 dark:bg-gray-900">
                    <div className="text-xs app-text-faint mb-1">Amount:</div>
                    <div className="text-sm app-text-strong font-medium">
                      ${approval.context.amount.toFixed(2)}
                    </div>
                  </div>
                )}

                {approval.status === "approved" && (
                  <div className="text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded mb-4">
                    Approved by <strong>{approval.approvedBy}</strong> {approval.approvedAt}
                  </div>
                )}

                {approval.status === "rejected" && (
                  <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded mb-4">
                    <div>
                      Rejected by <strong>{approval.rejectedBy}</strong> {approval.rejectedAt}
                    </div>
                    {approval.rejectionReason && (
                      <div className="text-xs mt-1">Reason: {approval.rejectionReason}</div>
                    )}
                  </div>
                )}

                {approval.status === "pending" && (
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setRejectDialog(approval.id)}>
                      <XCircle size={14} className="mr-1" />
                      Reject
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                      onClick={() => setApproveDialog(approval.id)}
                    >
                      <CheckCircle size={14} className="mr-1" />
                      Approve
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={!!approveDialog} onOpenChange={(open) => !open && setApproveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this request? The action will be executed immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => approveDialog && handleApprove(approveDialog)}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this request? The requester will be notified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => rejectDialog && handleReject(rejectDialog)}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
