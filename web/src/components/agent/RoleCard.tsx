import { useI18n } from '@/i18n/I18nProvider';

export type AgentRole = 'owner' | 'supervisor' | 'assistant' | 'member';
export type AgentStatus = 'idle' | 'running' | 'success' | 'error' | 'offline';

export type RoleCardProps = {
  avatarInitial: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  summary: string;
};

export function RoleCard({ avatarInitial, name, role, status, summary }: RoleCardProps) {
  const { t } = useI18n();
  return (
    <article className="role-card" data-role={role} data-status={status}>
      <header className="role-card__header">
        <div className="role-card__avatar" aria-hidden="true">
          {avatarInitial}
        </div>
        <div className="role-card__body">
          <h2 className="role-card__name">{name}</h2>
          <div className="role-card__meta">
            <span className="role-card__pill role-card__role">{t(`roles.${role}`)}</span>
            <span className="role-card__pill role-card__status">{t(`agentStatus.${status}`)}</span>
          </div>
        </div>
      </header>
      <p className="role-card__summary">{summary}</p>
    </article>
  );
}
