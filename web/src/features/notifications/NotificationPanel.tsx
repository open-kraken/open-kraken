/**
 * Phase 6: Notification panel — dropdown showing up to 6 recent unread conversations.
 * Migrated from golutra's NotificationPreview.vue.
 */

import type { NotificationPreviewItem } from '@/state/notification-store';

type NotificationPanelProps = {
  items: NotificationPreviewItem[];
  onClickConversation: (conversationId: string) => void;
  onMarkAllRead: () => void;
};

export const NotificationPanel = ({
  items,
  onClickConversation,
  onMarkAllRead,
}: NotificationPanelProps) => {
  if (items.length === 0) {
    return (
      <div className="notification-panel notification-panel--empty">
        <p>No unread messages</p>
      </div>
    );
  }

  return (
    <div className="notification-panel">
      <header className="notification-panel__header">
        <span className="notification-panel__title">Notifications</span>
        <button
          type="button"
          className="notification-panel__mark-read"
          onClick={onMarkAllRead}
        >
          Mark all read
        </button>
      </header>
      <ul className="notification-panel__list">
        {items.map((item) => (
          <li key={item.conversationId} className="notification-panel__item">
            <button
              type="button"
              className="notification-panel__conversation"
              onClick={() => onClickConversation(item.conversationId)}
            >
              <div className="notification-panel__avatar">
                {item.senderAvatar || item.senderName.charAt(0).toUpperCase()}
              </div>
              <div className="notification-panel__content">
                <div className="notification-panel__meta">
                  <span className="notification-panel__sender">{item.senderName}</span>
                  <span className="notification-panel__conv-name">{item.conversationName}</span>
                  {item.conversationUnread > 1 && (
                    <span className="notification-panel__badge">{item.conversationUnread}</span>
                  )}
                </div>
                <p className="notification-panel__preview">
                  {item.preview.length > 80 ? item.preview.slice(0, 80) + '...' : item.preview}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
