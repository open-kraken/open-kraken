/**
 * NodeTokenBreakdown shows per-node aggregated token consumption (T09).
 * Groups TokenStats by nodeId and renders a simple breakdown table.
 * Members without a nodeId are grouped under "Unassigned".
 */

import { useMemo } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { TokenStats } from '@/types/token';

export type NodeTokenBreakdownProps = {
  stats: TokenStats[];
};

type NodeAggregate = {
  nodeId: string;
  label: string;
  totalTokens: number;
  totalCost: number;
  memberCount: number;
};

/**
 * NodeTokenBreakdown
 * Groups and displays token consumption by node.
 *
 * @param stats - Full list of per-member token statistics to aggregate.
 */
export const NodeTokenBreakdown = ({ stats }: NodeTokenBreakdownProps) => {
  const { t } = useI18n();

  const aggregates = useMemo((): NodeAggregate[] => {
    const map = new Map<string, NodeAggregate>();

    for (const s of stats) {
      const key = s.nodeId ?? '__unassigned__';
      const existing = map.get(key);
      if (existing) {
        existing.totalTokens += s.totalTokens;
        existing.totalCost += s.cost;
        existing.memberCount += 1;
      } else {
        map.set(key, {
          nodeId: key,
          label: s.nodeId ?? 'Unassigned',
          totalTokens: s.totalTokens,
          totalCost: s.cost,
          memberCount: 1
        });
      }
    }

    return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  }, [stats]);

  if (aggregates.length === 0) {
    return (
      <div style={{ color: '#6b7280', padding: '16px' }}>{t('nodeToken.empty')}</div>
    );
  }

  return (
    <div className="node-token-breakdown" style={{ overflowX: 'auto' }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
        aria-label={t('nodeToken.aria')}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>{t('nodeToken.node')}</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>{t('nodeToken.members')}</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>{t('nodeToken.totalTokens')}</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>{t('nodeToken.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((agg) => (
            <tr key={agg.nodeId} style={{ borderBottom: '1px solid #1f2937' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                {agg.nodeId === '__unassigned__' || agg.label === 'Unassigned' ? t('nodeToken.unassigned') : agg.label}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#9ca3af' }}>{agg.memberCount}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                {agg.totalTokens.toLocaleString()}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#9ca3af' }}>
                ${agg.totalCost.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
