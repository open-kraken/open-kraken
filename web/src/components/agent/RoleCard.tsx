import { useI18n } from '@/i18n/I18nProvider';
import styles from './RoleCard.module.css';

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
    <article className={styles['role-card']} data-role={role} data-status={status}>
      <header className={styles['role-card__header']}>
        <div className={styles['role-card__avatar']} aria-hidden="true">
          {avatarInitial}
        </div>
        <div className={styles['role-card__body']}>
          <h2 className={styles['role-card__name']}>{name}</h2>
          <div className={styles['role-card__meta']}>
            <span className={`${styles['role-card__pill']} ${styles['role-card__role']}`}>{t(`roles.${role}`)}</span>
            <span className={`${styles['role-card__pill']} ${styles['role-card__status']}`}>{t(`agentStatus.${status}`)}</span>
          </div>
        </div>
      </header>
      <p className={styles['role-card__summary']}>{summary}</p>
    </article>
  );
}
