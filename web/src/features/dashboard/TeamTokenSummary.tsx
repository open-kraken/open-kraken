/**
 * TeamTokenSummary displays aggregate token consumption metrics for the team (T09).
 * Shows: total tokens consumed, estimated total cost, and number of active agents.
 */

import type { TokenStats, AgentActivity } from '@/types/token';

export type TeamTokenSummaryProps = {
  stats: TokenStats[];
  activities: AgentActivity[];
  period: string;
};

/**
 * TeamTokenSummary
 * Renders three summary cards: total tokens, total cost, and active agent count.
 *
 * @param stats - Per-member token statistics.
 * @param activities - Current agent activity list (used to count active agents).
 * @param period - The reporting period label.
 */
export const TeamTokenSummary = ({ stats, activities, period }: TeamTokenSummaryProps) => {
  const totalTokens = stats.reduce((acc, s) => acc + s.totalTokens, 0);
  const totalCost = stats.reduce((acc, s) => acc + s.cost, 0);
  // Active = agents whose status is 'running' or 'working'
  const activeAgents = activities.filter((a) =>
    ['running', 'working', 'busy', 'in_progress'].includes(a.status.toLowerCase())
  ).length;

  const cardStyle: React.CSSProperties = {
    padding: '16px 20px',
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    flex: '1 1 160px'
  };

  return (
    <section
      className="team-token-summary"
      aria-label="Team token usage summary"
      style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}
    >
      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>Period</p>
        <strong style={{ fontSize: '1.25rem' }}>{period || '—'}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Reporting window</p>
      </div>

      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>Total tokens</p>
        <strong style={{ fontSize: '1.5rem' }}>{totalTokens.toLocaleString()}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Across all members</p>
      </div>

      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>Estimated cost</p>
        <strong style={{ fontSize: '1.5rem' }}>${totalCost.toFixed(2)}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>USD (indicative)</p>
      </div>

      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>Active agents</p>
        <strong style={{ fontSize: '1.5rem' }}>{activeAgents}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Currently running</p>
      </div>
    </section>
  );
};
