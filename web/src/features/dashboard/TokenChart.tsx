/**
 * TokenChart — SVG bar chart of per-member token consumption (T09).
 * No external chart library; renders stacked input/output bars.
 */

import { useMemo } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { TokenStats } from '@/types/token';
import s from './dashboard.module.css';

export type TokenChartProps = { stats: TokenStats[] };

const BAR_HEIGHT = 24;
const BAR_GAP = 8;
const LEFT_MARGIN = 140;
const RIGHT_MARGIN = 60;
const CHART_WIDTH = 560;

export const TokenChart = ({ stats }: TokenChartProps) => {
  const { t } = useI18n();
  const sorted = useMemo(() => [...stats].sort((a, b) => b.totalTokens - a.totalTokens), [stats]);

  if (sorted.length === 0) {
    return <div className={s['chart-empty']}>{t('tokenChart.empty')}</div>;
  }

  const maxTokens = sorted[0].totalTokens || 1;
  const usableWidth = CHART_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
  const svgHeight = sorted.length * (BAR_HEIGHT + BAR_GAP) + BAR_GAP + 24;

  return (
    <div className={s['chart-wrap']}>
      <svg
        role="img"
        aria-label={t('tokenChart.aria')}
        width={CHART_WIDTH}
        height={svgHeight}
        className={s['chart-svg']}
      >
        <text
          x={LEFT_MARGIN + usableWidth / 2}
          y={svgHeight - 4}
          textAnchor="middle"
          className={s['chart-axis-label']}
        >
          {t('tokenChart.axisLabel')}
        </text>

        {sorted.map((member, idx) => {
          const y = BAR_GAP + idx * (BAR_HEIGHT + BAR_GAP);
          const totalWidth = (member.totalTokens / maxTokens) * usableWidth;
          const inputFraction = member.totalTokens > 0 ? member.inputTokens / member.totalTokens : 0.5;
          const adjustedInputWidth = totalWidth * inputFraction;
          const adjustedOutputWidth = totalWidth * (1 - inputFraction);

          return (
            <g
              key={member.memberId}
              role="listitem"
              aria-label={t('tokenChart.memberAria', { name: member.memberName, count: member.totalTokens.toLocaleString() })}
            >
              <text
                x={LEFT_MARGIN - 8}
                y={y + BAR_HEIGHT / 2 + 4}
                textAnchor="end"
                className={s['chart-member-label']}
              >
                {member.memberName.length > 16 ? `${member.memberName.slice(0, 15)}…` : member.memberName}
              </text>
              <rect
                x={LEFT_MARGIN}
                y={y}
                width={Math.max(adjustedInputWidth, 0)}
                height={BAR_HEIGHT}
                rx="2"
                className={s['chart-bar-input']}
                aria-hidden="true"
              />
              <rect
                x={LEFT_MARGIN + adjustedInputWidth}
                y={y}
                width={Math.max(adjustedOutputWidth, 0)}
                height={BAR_HEIGHT}
                rx="2"
                className={s['chart-bar-output']}
                aria-hidden="true"
              />
              <text
                x={LEFT_MARGIN + totalWidth + 6}
                y={y + BAR_HEIGHT / 2 + 4}
                className={s['chart-value-label']}
              >
                {(member.totalTokens / 1000).toFixed(1)}k
              </text>
            </g>
          );
        })}
      </svg>

      <div className={s['chart-legend']}>
        <span>
          <span className={`${s['chart-legend-swatch']} ${s['chart-legend-swatch--input']}`} />
          {t('agentActivity.input')}
        </span>
        <span>
          <span className={`${s['chart-legend-swatch']} ${s['chart-legend-swatch--output']}`} />
          {t('agentActivity.output')}
        </span>
      </div>
    </div>
  );
};
