/**
 * EmptyState — friendly empty page placeholder with icon, text, and CTA.
 * Reference: Vercel Dashboard empty states.
 */

type EmptyStateProps = {
  icon?: 'chat' | 'members' | 'terminal' | 'nodes' | 'dashboard' | 'ledger' | 'plugins' | 'generic';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const icons: Record<string, string> = {
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  members: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  terminal: 'M4 17l6-6-6-6 M12 19h8',
  nodes: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  dashboard: 'M18 20V10 M12 20V4 M6 20v-6',
  ledger: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  plugins: 'M12 2v6m0 12v2m-6-8H2m20 0h-4M7.8 7.8L5 5m14 0l-2.8 2.8M7.8 16.2L5 19m14 0l-2.8-2.8',
  generic: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
};

export const EmptyState = ({
  icon = 'generic',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) => (
  <div className="empty-state">
    <div className="empty-state__icon-ring">
      <svg
        className="empty-state__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {(icons[icon] ?? icons.generic).split(' M').map((segment, i) => (
          <path key={i} d={i === 0 ? segment : `M${segment}`} />
        ))}
      </svg>
    </div>
    <h3 className="empty-state__title">{title}</h3>
    {description && <p className="empty-state__desc">{description}</p>}
    {actionLabel && onAction && (
      <button type="button" className="empty-state__action" onClick={onAction}>
        {actionLabel}
      </button>
    )}
  </div>
);
