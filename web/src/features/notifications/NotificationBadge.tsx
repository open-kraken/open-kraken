/**
 * Phase 6: Notification badge component — displays unread count in the nav bar.
 */

type NotificationBadgeProps = {
  count: number;
  onClick?: () => void;
};

export const NotificationBadge = ({ count, onClick }: NotificationBadgeProps) => {
  if (count === 0) return null;

  return (
    <button
      type="button"
      className="notification-badge"
      onClick={onClick}
      aria-label={`${count} unread notifications`}
      data-count={count}
    >
      <span className="notification-badge__count">
        {count > 99 ? '99+' : count}
      </span>
    </button>
  );
};
