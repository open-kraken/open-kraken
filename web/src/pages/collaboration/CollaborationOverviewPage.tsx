import { useI18n } from '@/i18n/I18nProvider';
import { RoleCard, type RoleCardProps } from '../../components/agent/RoleCard';

type CollaborationOverviewPageProps = {
  members: RoleCardProps[];
};

export function CollaborationOverviewPage({ members }: CollaborationOverviewPageProps) {
  const { t } = useI18n();
  const runningCount = members.filter((member) => member.status === 'running').length;
  const blockedCount = members.filter((member) => member.status === 'error').length;

  return (
    <main className="collaboration-overview-page">
      <section className="collaboration-overview-page__shell">
        <header className="collaboration-overview-page__hero">
          <div>
            <p className="collaboration-overview-page__eyebrow">{t('collab.eyebrow')}</p>
            <h1 className="collaboration-overview-page__headline">{t('collab.title')}</h1>
            <p className="collaboration-overview-page__intro">{t('collab.intro')}</p>
          </div>
          <div className="collaboration-overview-page__metrics">
            <div className="collaboration-overview-page__metric">
              <span className="collaboration-overview-page__metric-label">{t('collab.agents')}</span>
              <strong className="collaboration-overview-page__metric-value">{members.length}</strong>
            </div>
            <div className="collaboration-overview-page__metric">
              <span className="collaboration-overview-page__metric-label">{t('collab.running')}</span>
              <strong className="collaboration-overview-page__metric-value">{runningCount}</strong>
            </div>
            <div className="collaboration-overview-page__metric">
              <span className="collaboration-overview-page__metric-label">{t('collab.blocked')}</span>
              <strong className="collaboration-overview-page__metric-value">{blockedCount}</strong>
            </div>
          </div>
        </header>

        <section className="collaboration-overview-page__grid" aria-label={t('collab.gridAria')}>
          {members.map((member) => (
            <RoleCard key={`${member.role}-${member.name}`} {...member} />
          ))}
        </section>
      </section>
    </main>
  );
}
