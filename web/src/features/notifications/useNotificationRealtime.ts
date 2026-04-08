/**
 * Hook that subscribes to chat.delta and presence.status realtime events
 * and updates the notification store accordingly.
 */

import { useEffect, useRef, useState } from 'react';
import type { RealtimeClient } from '@/realtime/realtime-client';
import {
  createNotificationStore,
  requestBrowserNotification,
  type NotificationState,
} from '@/state/notification-store';

type ChatDeltaPayload = {
  conversationId: string;
  messageId: string;
  sequence: number;
  body: string;
};

type ChatStatusPayload = {
  conversationId: string;
  messageId: string;
  status: string;
};

type PresenceStatusPayload = {
  memberId: string;
  presenceState: string;
  terminalStatus: string;
};

export const useNotificationRealtime = (
  realtimeClient: RealtimeClient,
  workspaceId: string,
) => {
  const storeRef = useRef(createNotificationStore());
  const [state, setState] = useState<NotificationState>({ totalUnread: 0, items: [] });

  useEffect(() => {
    const store = storeRef.current;
    const unsub = store.subscribe(setState);
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    // Subscribe to chat delta events for unread tracking.
    const chatDeltaSub = realtimeClient.subscribe<ChatDeltaPayload>(
      'chat.delta',
      (event) => {
        const p = event.payload;
        storeRef.current.updateConversation({
          conversationId: p.conversationId,
          conversationName: p.conversationId, // name resolved elsewhere
          unreadCount: 1,
          lastMessage: {
            senderId: '',
            senderName: '',
            senderAvatar: '',
            preview: p.body.slice(0, 120),
            timestamp: Date.now(),
          },
          workspaceId,
        });

        // Browser notification for new messages.
        void requestBrowserNotification(
          'New message',
          p.body.slice(0, 80),
        );
      },
    );

    // Subscribe to presence status events.
    const presenceSub = realtimeClient.subscribe<PresenceStatusPayload>(
      'presence.status',
      (_event) => {
        // Presence changes are handled by the members page / friends panel.
        // No notification store update needed here.
      },
    );

    return () => {
      chatDeltaSub.unsubscribe();
      presenceSub.unsubscribe();
    };
  }, [realtimeClient, workspaceId]);

  return {
    notificationState: state,
    markAllRead: () => storeRef.current.markAllRead(),
    markConversationRead: (convId: string) => storeRef.current.markConversationRead(convId),
  };
};
