/**
 * TeamTokenSummary — aggregate token consumption metric cards (T09).
 * Shows: period, total tokens, estimated cost, active agents.
 */

import { useI18n } from '@/i18n/I18nProvider';
import type { TokenStats, AgentActivity } from '@/types/token';
import s from './dashboard.module.css';

export type TeamTokenSummaryProps = {
  stats: TokenStats[];
  activities: AgentActivity[];
  period: string;
};

export const TeamTokenSummary = ({ stats, activities, period }: TeamTokenSummaryProps) => {
  const { t } = useI18n();
  const totalTokens = stats.reduce((acc, x) => acc + x.totalTokens, 0);
  const totalCost = stats.reduce((acc, x) => acc + x.cost, 0);
  const activeAgents = activities.filter((a) =>
    ['running', 'working', 'busy', 'in_progress'].includes(a.status.toLowerCase())
  ).length;

  return (
    <section className={s['summary-strip']} aria-label={t('dash.summaryAria')}>
      <div className={s['summary-card']}>
        <p className={s['summary-card__label']}>{t('dash.period')}</p>
        <strong className={s['summary-card__value']}>{period || '—'}</strong>
        <p className={s['summary-card__hint']}>{t('dash.reportingWindow')}</p>
      </div>
      <div className={s['summary-card']}>
        <p className={s['summary-card__label']}>{t('dash.totalTokens')}</p>
        <strong className={s['summary-card__value']}>{totalTokens.toLocaleString()}</strong>
        <p className={s['summary-card__hint']}>{t('dash.acrossMembers')}</p>
      </div>
      <div className={s['summary-card']}>
        <p className={s['summary-card__label']}>{t('dash.estimatedCost')}</p>
        <strong className={s['summary-card__value']}>${totalCost.toFixed(2)}</strong>
        <p className={s['summary-card__hint']}>{t('dash.usdHint')}</p>
      </div>
      <div className={s['summary-card']}>
        <p className={s['summary-card__label']}>{t('dash.activeAgents')}</p>
        <strong className={s['summary-card__value']}>{activeAgents}</strong>
        <p className={s['summary-card__hint']}>{t('dash.currentlyRunning')}</p>
      </div>
    </section>
  );
};
