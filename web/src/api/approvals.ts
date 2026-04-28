import { getHttpClient } from '@/api/http-binding';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ApprovalRisk = 'high' | 'medium' | 'low';
export type ApprovalType = 'deploy' | 'file_write' | 'shell_exec' | 'git_push' | 'secret_access' | 'budget';

export type Approval = {
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
};

type ApprovalApi = Approval & { context?: Record<string, unknown> };

const asApproval = (raw: ApprovalApi): Approval => ({
  ...raw,
  context: {
    agent: typeof raw.context?.agent === 'string' ? raw.context.agent : undefined,
    task: typeof raw.context?.task === 'string' ? raw.context.task : undefined,
    command: typeof raw.context?.command === 'string' ? raw.context.command : undefined,
    file: typeof raw.context?.file === 'string' ? raw.context.file : undefined,
    amount: typeof raw.context?.amount === 'number' ? raw.context.amount : undefined,
  },
});

export async function getApprovals(): Promise<{ items: Approval[] }> {
  const http = getHttpClient();
  const body = await http.get<{ items?: ApprovalApi[] }>('/approvals');
  return { items: (body.items ?? []).map(asApproval) };
}

export async function decideApproval(
  approvalId: string,
  input: { decision: 'approve' | 'reject'; confirmed: boolean; confirmation?: string; reason?: string }
): Promise<{ approval: Approval }> {
  const http = getHttpClient();
  const body = await http.post<{ approval: ApprovalApi }>(`/approvals/${encodeURIComponent(approvalId)}/decision`, input);
  return { approval: asApproval(body.approval) };
}
