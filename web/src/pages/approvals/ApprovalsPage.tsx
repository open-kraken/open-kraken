import { useEffect, useMemo, useState } from "react";
import { decideApproval, getApprovals, type Approval, type ApprovalRisk, type ApprovalStatus, type ApprovalType } from "@/api/approvals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
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
  const { account } = useAuth();
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ approval: Approval; action: "approve" | "reject" } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getApprovals()
      .then((response) => {
        if (cancelled) return;
        setApprovals(response.items);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredApprovals =
    filter === "all" ? approvals : approvals.filter((a) => a.status === filter);

  const pendingCount = approvals.filter((a) => a.status === "pending").length;
  const approvedCount = approvals.filter((a) => a.status === "approved").length;
  const rejectedCount = approvals.filter((a) => a.status === "rejected").length;
  const canDecide = account?.role === "owner" || account?.role === "supervisor";

  const openDecision = (approval: Approval, action: "approve" | "reject") => {
    setDecision({ approval, action });
    setConfirmation("");
    setReason("");
    setDecisionError(null);
  };

  const closeDecision = () => {
    if (submitting) return;
    setDecision(null);
    setConfirmation("");
    setReason("");
    setDecisionError(null);
  };

  const expectedPhrase = useMemo(() => {
    if (!decision || decision.approval.risk !== "high") return "";
    return `${decision.action.toUpperCase()} ${decision.approval.id}`;
  }, [decision]);

  const submitDisabled = !decision ||
    submitting ||
    !canDecide ||
    (decision.approval.risk === "high" && confirmation.trim() !== expectedPhrase);

  const submitDecision = async () => {
    if (!decision || submitDisabled) return;
    setSubmitting(true);
    setDecisionError(null);
    try {
      const response = await decideApproval(decision.approval.id, {
        decision: decision.action,
        confirmed: true,
        confirmation: confirmation.trim(),
        reason: reason.trim() || undefined,
      });
      setApprovals((current) => current.map((item) => item.id === response.approval.id ? response.approval : item));
      setDecision(null);
      setConfirmation("");
      setReason("");
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
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
            {!canDecide && (
              <p className="text-xs text-red-600 mt-2">
                Only owners and supervisors can approve or reject requests.
              </p>
            )}
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
          {loadError ? (
            <div className="text-center py-12">
              <AlertTriangle size={48} className="mx-auto text-red-500 mb-3" />
              <h3 className="font-semibold app-text-strong mb-1">Approvals unavailable</h3>
              <p className="text-sm app-text-muted">{loadError}</p>
            </div>
          ) : filteredApprovals.length === 0 ? (
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
                    <Button variant="outline" size="sm" disabled={!canDecide} onClick={() => openDecision(approval, "reject")}>
                      <XCircle size={14} className="mr-1" />
                      Reject
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                      disabled={!canDecide}
                      onClick={() => openDecision(approval, "approve")}
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

      <Dialog open={!!decision} onOpenChange={(open) => !open && closeDecision()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "approve" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
            <DialogDescription>
              This decision is enforced server-side and written to the audit ledger.
            </DialogDescription>
          </DialogHeader>

          {decision && (
            <div className="space-y-4">
              <div className="rounded-md border app-border-subtle p-3">
                <div className="flex items-center gap-2 mb-2">
                  {getRiskBadge(decision.approval.risk)}
                  <Badge variant="outline" className="text-[10px]">
                    {decision.approval.type.replace("_", " ")}
                  </Badge>
                </div>
                <div className="font-medium app-text-strong">{decision.approval.title}</div>
                <div className="text-sm app-text-muted mt-1">{decision.approval.description}</div>
              </div>

              {decision.approval.risk === "high" && (
                <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-600 mb-2">
                    <AlertTriangle size={14} />
                    High-risk confirmation required
                  </div>
                  <p className="text-xs app-text-muted mb-2">
                    Type the exact phrase to continue: <code className="font-mono app-text-strong">{expectedPhrase}</code>
                  </p>
                  <Input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder={expectedPhrase}
                  />
                </div>
              )}

              {decision.action === "reject" && (
                <div>
                  <div className="text-sm font-medium app-text-strong mb-1">Reason</div>
                  <Textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Explain why this request is rejected"
                  />
                </div>
              )}

              {decisionError && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded">
                  {decisionError}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDecision} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant={decision?.action === "reject" ? "destructive" : "default"}
              onClick={() => void submitDecision()}
              disabled={submitDisabled}
              className={decision?.action === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : undefined}
            >
              {submitting ? "Submitting..." : decision?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
