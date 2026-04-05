/**
 * TokenChart renders a bar chart of per-member token consumption (T09).
 * Implemented with inline SVG to avoid requiring an external chart library.
 * Displays input and output tokens as stacked bars per member.
 */

import { useMemo } from 'react';
import type { TokenStats } from '@/types/token';

export type TokenChartProps = {
  stats: TokenStats[];
};

const BAR_HEIGHT = 24;
const BAR_GAP = 8;
const LEFT_MARGIN = 140; // space for member name labels
const RIGHT_MARGIN = 60; // space for value labels
const CHART_WIDTH = 560;

/**
 * TokenChart
 * SVG bar chart visualising per-member token consumption.
 * Each bar represents a member; the bar is split into input (blue) and output (indigo) segments.
 *
 * @param stats - Array of TokenStats, one entry per member.
 */
export const TokenChart = ({ stats }: TokenChartProps) => {
  const sorted = useMemo(
    () => [...stats].sort((a, b) => b.totalTokens - a.totalTokens),
    [stats]
  );

  if (sorted.length === 0) {
    return (
      <div style={{ color: '#6b7280', padding: '24px', textAlign: 'center' }}>
        No token data available.
      </div>
    );
  }

  const maxTokens = sorted[0].totalTokens || 1;
  const usableWidth = CHART_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
  const svgHeight = sorted.length * (BAR_HEIGHT + BAR_GAP) + BAR_GAP + 24; // +24 for x-axis label

  return (
    <div className="token-chart" style={{ overflowX: 'auto' }}>
      <svg
        role="img"
        aria-label="Per-member token consumption bar chart"
        width={CHART_WIDTH}
        height={svgHeight}
        style={{ display: 'block', fontFamily: 'inherit' }}
      >
        {/* X-axis label */}
        <text
          x={LEFT_MARGIN + usableWidth / 2}
          y={svgHeight - 4}
          textAnchor="middle"
          fontSize="11"
          fill="#6b7280"
        >
          Token count
        </text>

        {sorted.map((member, idx) => {
          const y = BAR_GAP + idx * (BAR_HEIGHT + BAR_GAP);
          const inputWidth = (member.inputTokens / maxTokens) * usableWidth;
          const outputWidth = (member.outputTokens / maxTokens) * usableWidth;
          // Clamp so both segments fit within the total bar width
          const totalWidth = (member.totalTokens / maxTokens) * usableWidth;
          const inputFraction = member.totalTokens > 0 ? member.inputTokens / member.totalTokens : 0.5;
          const adjustedInputWidth = totalWidth * inputFraction;
          const adjustedOutputWidth = totalWidth * (1 - inputFraction);

          return (
            <g key={member.memberId} role="listitem" aria-label={`${member.memberName}: ${member.totalTokens.toLocaleString()} tokens`}>
              {/* Member name label */}
              <text
                x={LEFT_MARGIN - 8}
                y={y + BAR_HEIGHT / 2 + 4}
                textAnchor="end"
                fontSize="12"
                fill="#d1d5db"
              >
                {member.memberName.length > 16 ? `${member.memberName.slice(0, 15)}…` : member.memberName}
              </text>

              {/* Input tokens segment (lighter blue) */}
              <rect
                x={LEFT_MARGIN}
                y={y}
                width={Math.max(adjustedInputWidth, 0)}
                height={BAR_HEIGHT}
                fill="#3b82f6"
                rx="2"
                aria-hidden="true"
              />

              {/* Output tokens segment (indigo) */}
              <rect
                x={LEFT_MARGIN + adjustedInputWidth}
                y={y}
                width={Math.max(adjustedOutputWidth, 0)}
                height={BAR_HEIGHT}
                fill="#6366f1"
                rx="2"
                aria-hidden="true"
              />

              {/* Total value label */}
              <text
                x={LEFT_MARGIN + totalWidth + 6}
                y={y + BAR_HEIGHT / 2 + 4}
                fontSize="11"
                fill="#9ca3af"
              >
                {(member.totalTokens / 1000).toFixed(1)}k
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.75rem', color: '#9ca3af' }}>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#3b82f6', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
          Input tokens
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#6366f1', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
          Output tokens
        </span>
      </div>
    </div>
  );
};
