/**
 * SparkChart — tiny inline SVG line/area chart.
 * Reference: Vercel Analytics spark lines.
 */

type SparkChartProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showArea?: boolean;
  className?: string;
};

export const SparkChart = ({
  data,
  width = 120,
  height = 32,
  color = 'var(--app-accent, #3ecfae)',
  showArea = true,
  className = '',
}: SparkChartProps) => {
  if (data.length < 2) return null;

  const padding = 2;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * w,
    y: padding + h - ((v - min) / range) * h,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg
      className={`spark-chart ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showArea && (
        <path className="spark-chart__area" d={areaPath} fill={`url(#${gradientId})`} />
      )}
      <path className="spark-chart__line" d={linePath} stroke={color} />
      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2"
        fill={color}
      />
    </svg>
  );
};
