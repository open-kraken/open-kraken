/**
 * LoadingButton — button with inline spinner during async operations.
 */

type LoadingButtonProps = {
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  type?: 'button' | 'submit';
  tone?: 'primary' | 'secondary' | 'danger';
};

export const LoadingButton = ({
  loading = false,
  disabled = false,
  className = '',
  onClick,
  children,
  type = 'button',
  tone = 'primary',
}: LoadingButtonProps) => (
  <button
    type={type}
    className={`loading-button loading-button--${tone} ${className}`}
    onClick={onClick}
    disabled={disabled || loading}
    data-loading={loading || undefined}
  >
    {loading && (
      <svg className="loading-button__spinner" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )}
    <span className={loading ? 'loading-button__label--loading' : ''}>{children}</span>
  </button>
);
