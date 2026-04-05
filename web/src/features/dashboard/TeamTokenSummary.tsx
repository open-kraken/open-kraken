/**
 * TeamTokenSummary displays aggregate token consumption metrics for the team (T09).
 * Shows: total tokens consumed, estimated total cost, and number of active agents.
 */

import { useI18n } from '@/i18n/I18nProvider';
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
  const { t } = useI18n();
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
      aria-label={t('dash.summaryAria')}
      style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}
    >
      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>
          {t('dash.period')}
        </p>
        <strong style={{ fontSize: '1.25rem' }}>{period || t('system.emDash')}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>{t('dash.reportingWindow')}</p>
      </div>

      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>
          {t('dash.totalTokens')}
        </p>
        <strong style={{ fontSize: '1.5rem' }}>{totalTokens.toLocaleString()}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>{t('dash.acrossMembers')}</p>
      </div>

      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>
          {t('dash.estimatedCost')}
        </p>
        <strong style={{ fontSize: '1.5rem' }}>${totalCost.toFixed(2)}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>{t('dash.usdHint')}</p>
      </div>

      <div style={cardStyle}>
        <p className="page-eyebrow" style={{ marginBottom: '4px', fontSize: '0.7rem' }}>
          {t('dash.activeAgents')}
        </p>
        <strong style={{ fontSize: '1.5rem' }}>{activeAgents}</strong>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>{t('dash.currentlyRunning')}</p>
      </div>
    </section>
  );
};
