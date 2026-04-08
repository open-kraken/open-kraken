/**
 * Skeleton — shimmer loading placeholder components.
 * Reference: Linear's grey pulse stripe pattern.
 *
 * Usage:
 *   <Skeleton width="60%" />           — single line
 *   <SkeletonBlock lines={4} />        — multi-line text block
 *   <SkeletonCard />                   — card-shaped placeholder
 *   <SkeletonTable rows={5} cols={4}/> — table placeholder
 *   <SkeletonAvatar />                 — circular avatar
 */

type SkeletonProps = {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
};

export const Skeleton = ({
  width = '100%',
  height = '0.75rem',
  radius = '4px',
  className = '',
}: SkeletonProps) => (
  <span
    className={`skeleton ${className}`}
    style={{ width, height, borderRadius: radius }}
    aria-hidden="true"
  />
);

export const SkeletonAvatar = ({ size = '2rem' }: { size?: string }) => (
  <Skeleton width={size} height={size} radius="50%" />
);

export const SkeletonBlock = ({ lines = 3, gap = '0.5rem' }: { lines?: number; gap?: string }) => (
  <div className="skeleton-block" style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
    ))}
  </div>
);

export const SkeletonCard = () => (
  <div className="skeleton-card" aria-hidden="true">
    <div className="skeleton-card__header">
      <SkeletonAvatar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <Skeleton width="40%" height="0.65rem" />
        <Skeleton width="70%" height="0.55rem" />
      </div>
    </div>
    <SkeletonBlock lines={2} />
  </div>
);

type SkeletonTableProps = {
  rows?: number;
  cols?: number;
};

export const SkeletonTable = ({ rows = 5, cols = 4 }: SkeletonTableProps) => (
  <div className="skeleton-table" aria-hidden="true" role="status" aria-label="Loading data">
    {/* Header row */}
    <div className="skeleton-table__row skeleton-table__row--header">
      {Array.from({ length: cols }, (_, i) => (
        <Skeleton key={i} width={i === 0 ? '30%' : '60%'} height="0.55rem" />
      ))}
    </div>
    {/* Body rows */}
    {Array.from({ length: rows }, (_, ri) => (
      <div key={ri} className="skeleton-table__row" style={{ animationDelay: `${ri * 60}ms` }}>
        {Array.from({ length: cols }, (_, ci) => (
          <Skeleton key={ci} width={`${50 + Math.sin(ri + ci) * 25}%`} height="0.65rem" />
        ))}
      </div>
    ))}
  </div>
);

/** Page-level skeleton: hero header + content grid. */
export const SkeletonPage = () => (
  <div className="skeleton-page" aria-hidden="true" role="status" aria-label="Loading page">
    <div className="skeleton-page__header">
      <Skeleton width="8rem" height="0.55rem" />
      <Skeleton width="14rem" height="1.1rem" />
      <Skeleton width="22rem" height="0.65rem" />
    </div>
    <div className="skeleton-page__grid">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);
