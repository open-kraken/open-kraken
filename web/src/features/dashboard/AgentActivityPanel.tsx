/**
 * AgentActivityPanel — per-agent status, task, and token usage table (T09).
 */

import { useI18n } from '@/i18n/I18nProvider';
import type { AgentActivity } from '@/types/token';
import s from './dashboard.module.css';

export type AgentActivityPanelProps = { activities: AgentActivity[] };

export const AgentActivityPanel = ({ activities }: AgentActivityPanelProps) => {
  const { t } = useI18n();

  if (activities.length === 0) {
    return <div className={s['data-table__empty']}>{t('agentActivity.empty')}</div>;
  }

  return (
    <div className={s['data-table-wrap']}>
      <table className={s['data-table']} aria-label={t('agentActivity.aria')}>
        <thead>
          <tr>
            <th>{t('agentActivity.agent')}</th>
            <th>{t('agentActivity.status')}</th>
            <th>{t('agentActivity.task')}</th>
            <th data-align="right">{t('agentActivity.input')}</th>
            <th data-align="right">{t('agentActivity.output')}</th>
            <th data-align="right">{t('agentActivity.total')}</th>
            <th data-align="right">{t('agentActivity.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.memberId} data-member-id={a.memberId}>
              <td className={s['data-table__name']}>{a.memberName}</td>
              <td>
                <span className={s['status-cell']}>
                  <span className={s['status-dot']} data-status={a.status.toLowerCase()} />
                  {a.status}
                </span>
              </td>
              <td>
                <span className={s['task-cell']} title={a.currentTask}>{a.currentTask ?? '—'}</span>
              </td>
              <td data-align="right">{a.tokenStats.inputTokens.toLocaleString()}</td>
              <td data-align="right">{a.tokenStats.outputTokens.toLocaleString()}</td>
              <td data-align="right" className={s['data-table__bold']}>{a.tokenStats.totalTokens.toLocaleString()}</td>
              <td data-align="right" className={s['data-table__muted']}>${a.tokenStats.cost.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
