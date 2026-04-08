/**
 * Phase 6: Notification store — aggregates unread counts across conversations
 * and provides notification preview items for the notification panel.
 *
 * Migrated from golutra's notificationOrchestratorStore.ts.
 */

export type NotificationPreviewItem = {
  workspaceId: string;
  conversationId: string;
  conversationName: string;
  conversationUnread: number;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderCanOpenTerminal: boolean;
  preview: string;
  lastMessageAt: number;
};

export type NotificationState = {
  totalUnread: number;
  items: NotificationPreviewItem[];
};

const MAX_PREVIEW_ITEMS = 6;

export const createNotificationStore = () => {
  let state: NotificationState = { totalUnread: 0, items: [] };
  const listeners = new Set<(s: NotificationState) => void>();

  const notify = () => listeners.forEach((fn) => fn(state));

  return {
    getState: () => state,

    subscribe: (listener: (s: NotificationState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Update unread counts from a conversation snapshot or delta event. */
    updateConversation: (conv: {
      conversationId: string;
      conversationName: string;
      unreadCount: number;
      lastMessage?: {
        senderId: string;
        senderName: string;
        senderAvatar: string;
        preview: string;
        timestamp: number;
        canOpenTerminal?: boolean;
      };
      workspaceId: string;
    }) => {
      // Update or insert the conversation in items.
      const existing = state.items.findIndex(
        (i) => i.conversationId === conv.conversationId
      );

      const item: NotificationPreviewItem = {
        workspaceId: conv.workspaceId,
        conversationId: conv.conversationId,
        conversationName: conv.conversationName,
        conversationUnread: conv.unreadCount,
        senderId: conv.lastMessage?.senderId ?? '',
        senderName: conv.lastMessage?.senderName ?? '',
        senderAvatar: conv.lastMessage?.senderAvatar ?? '',
        senderCanOpenTerminal: conv.lastMessage?.canOpenTerminal ?? false,
        preview: conv.lastMessage?.preview ?? '',
        lastMessageAt: conv.lastMessage?.timestamp ?? Date.now(),
      };

      const items = [...state.items];
      if (existing >= 0) {
        if (conv.unreadCount === 0) {
          items.splice(existing, 1);
        } else {
          items[existing] = item;
        }
      } else if (conv.unreadCount > 0) {
        items.push(item);
      }

      // Sort by most recent, limit to MAX_PREVIEW_ITEMS.
      items.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      const trimmed = items.slice(0, MAX_PREVIEW_ITEMS);

      const totalUnread = trimmed.reduce((sum, i) => sum + i.conversationUnread, 0);

      state = { totalUnread, items: trimmed };
      notify();
    },

    /** Mark all conversations as read. */
    markAllRead: () => {
      state = { totalUnread: 0, items: [] };
      notify();
    },

    /** Mark a single conversation as read. */
    markConversationRead: (conversationId: string) => {
      const items = state.items.filter((i) => i.conversationId !== conversationId);
      const totalUnread = items.reduce((sum, i) => sum + i.conversationUnread, 0);
      state = { totalUnread, items };
      notify();
    },
  };
};

/** Browser notification helper (replaces golutra's Tauri native notifications). */
export const requestBrowserNotification = async (title: string, body: string) => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
};
