export type AgentRole = 'owner' | 'supervisor' | 'assistant' | 'member';
export type AgentStatus = 'idle' | 'running' | 'success' | 'error' | 'offline';

export type RoleCardProps = {
  avatarInitial: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  summary: string;
};

const ROLE_LABELS: Record<AgentRole, string> = {
  owner: 'Owner',
  supervisor: 'Supervisor',
  assistant: 'Assistant',
  member: 'Member'
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  success: 'Success',
  error: 'Error',
  offline: 'Offline'
};

export function RoleCard({ avatarInitial, name, role, status, summary }: RoleCardProps) {
  return (
    <article className="role-card" data-role={role} data-status={status}>
      <header className="role-card__header">
        <div className="role-card__avatar" aria-hidden="true">
          {avatarInitial}
        </div>
        <div className="role-card__body">
          <h2 className="role-card__name">{name}</h2>
          <div className="role-card__meta">
            <span className="role-card__pill role-card__role">{ROLE_LABELS[role]}</span>
            <span className="role-card__pill role-card__status">{STATUS_LABELS[status]}</span>
          </div>
        </div>
      </header>
      <p className="role-card__summary">{summary}</p>
    </article>
  );
}
