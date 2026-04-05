import { RoleCard, type RoleCardProps } from '../../components/agent/RoleCard';

type CollaborationOverviewPageProps = {
  members: RoleCardProps[];
};

export function CollaborationOverviewPage({ members }: CollaborationOverviewPageProps) {
  const runningCount = members.filter((member) => member.status === 'running').length;
  const blockedCount = members.filter((member) => member.status === 'error').length;

  return (
    <main className="collaboration-overview-page">
      <section className="collaboration-overview-page__shell">
        <header className="collaboration-overview-page__hero">
          <div>
            <p className="collaboration-overview-page__eyebrow">open-kraken visual baseline</p>
            <h1 className="collaboration-overview-page__headline">
              CollaborationOverviewPage binds theme tokens, layout breakpoints, and role cards in one surface.
            </h1>
            <p className="collaboration-overview-page__intro">
              The page-level shell owns the spacing and breakpoint system while each role card exposes canonical
              role and runtime states for avatar rings, status pills, and card emphasis.
            </p>
          </div>
          <div className="collaboration-overview-page__metrics">
            <div className="collaboration-overview-page__metric">
              <span className="collaboration-overview-page__metric-label">Agents</span>
              <strong className="collaboration-overview-page__metric-value">{members.length}</strong>
            </div>
            <div className="collaboration-overview-page__metric">
              <span className="collaboration-overview-page__metric-label">Running</span>
              <strong className="collaboration-overview-page__metric-value">{runningCount}</strong>
            </div>
            <div className="collaboration-overview-page__metric">
              <span className="collaboration-overview-page__metric-label">Blocked</span>
              <strong className="collaboration-overview-page__metric-value">{blockedCount}</strong>
            </div>
          </div>
        </header>

        <section className="collaboration-overview-page__grid" aria-label="Active collaboration roles">
          {members.map((member) => (
            <RoleCard key={`${member.role}-${member.name}`} {...member} />
          ))}
        </section>
      </section>
    </main>
  );
}
