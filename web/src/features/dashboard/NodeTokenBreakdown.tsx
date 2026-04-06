/**
 * NodeTokenBreakdown — per-node aggregated token consumption table (T09).
 */

import { useMemo } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { TokenStats } from '@/types/token';
import s from './dashboard.module.css';

export type NodeTokenBreakdownProps = { stats: TokenStats[] };

type NodeAggregate = {
  nodeId: string;
  label: string;
  totalTokens: number;
  totalCost: number;
  memberCount: number;
};

export const NodeTokenBreakdown = ({ stats }: NodeTokenBreakdownProps) => {
  const { t } = useI18n();

  const aggregates = useMemo((): NodeAggregate[] => {
    const map = new Map<string, NodeAggregate>();
    for (const x of stats) {
      const key = x.nodeId ?? '__unassigned__';
      const existing = map.get(key);
      if (existing) {
        existing.totalTokens += x.totalTokens;
        existing.totalCost += x.cost;
        existing.memberCount += 1;
      } else {
        map.set(key, {
          nodeId: key,
          label: x.nodeId ?? 'Unassigned',
          totalTokens: x.totalTokens,
          totalCost: x.cost,
          memberCount: 1
        });
      }
    }
    return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  }, [stats]);

  if (aggregates.length === 0) {
    return <div className={s['data-table__empty']}>{t('nodeToken.empty')}</div>;
  }

  return (
    <div className={s['data-table-wrap']}>
      <table className={s['data-table']} aria-label={t('nodeToken.aria')}>
        <thead>
          <tr>
            <th>{t('nodeToken.node')}</th>
            <th data-align="right">{t('nodeToken.members')}</th>
            <th data-align="right">{t('nodeToken.totalTokens')}</th>
            <th data-align="right">{t('nodeToken.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((agg) => (
            <tr key={agg.nodeId}>
              <td className={s['data-table__name']}>
                {agg.nodeId === '__unassigned__' ? t('nodeToken.unassigned') : agg.label}
              </td>
              <td data-align="right" className={s['data-table__muted']}>{agg.memberCount}</td>
              <td data-align="right" className={s['data-table__bold']}>{agg.totalTokens.toLocaleString()}</td>
              <td data-align="right" className={s['data-table__muted']}>${agg.totalCost.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
