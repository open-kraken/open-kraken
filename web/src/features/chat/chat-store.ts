/**
 * Chat store — manages conversation and message state with realtime
 * event processing. Supports four message delivery modes aligned with golutra:
 *
 *   snapshot — full state replace (initial load or reconnect)
 *   delta    — incremental append (new message)
 *   stream   — live terminal output (throttled updates)
 *   final    — terminal output complete (replaces stream)
 *
 * Usage:
 *   const store = createChatStore();
 *   store.subscribe(setState);
 *   store.loadConversations(apiClient);
 *   store.selectConversation(convId, apiClient);
 *   store.applyRealtimeEvent(event);
 */

export type MessageMode = 'snapshot' | 'delta' | 'stream' | 'final';

export type ChatMessageItem = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  content: { type: string; text: string };
  status: string;
  createdAt: number;
  isAi?: boolean;
  mode?: MessageMode;
  /** For terminal messages: sequential ordering. */
  seq?: number;
  terminal?: {
    terminalId?: string;
    source?: string;
    command?: string;
  };
};

export type ChatConversationItem = {
  id: string;
  type: string;
  customName?: string | null;
  memberIds?: string[];
  lastMessagePreview?: string | null;
  lastMessageAt?: number;
  unreadCount: number;
  muted?: boolean;
  pinned?: boolean;
};

export type ChatStoreState = {
  conversations: ChatConversationItem[];
  activeConversationId: string | null;
  messages: ChatMessageItem[];
  /** For cursor-based pagination: ID of the earliest loaded message. */
  nextBeforeId: string | null;
  /** Per-conversation unread counts. */
  unreadByConversation: Record<string, number>;
  totalUnread: number;
  loading: boolean;
};

const initialState: ChatStoreState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  nextBeforeId: null,
  unreadByConversation: {},
  totalUnread: 0,
  loading: false,
};

type ApiClient = {
  getConversations: () => Promise<{ conversations: ChatConversationItem[] }>;
  getMessages: (conversationId: string) => Promise<{ items: ChatMessageItem[]; nextBeforeId: string | null }>;
  sendMessage: (conversationId: string, payload: unknown) => Promise<unknown>;
  markMessagesRead?: (workspaceId: string, conversationId: string, memberId: string, lastReadId: string) => Promise<{ unreadCount: number }>;
};

export const createChatStore = () => {
  let state = { ...initialState };
  const listeners = new Set<(s: ChatStoreState) => void>();
  const notify = () => { for (const fn of listeners) fn(state); };

  const update = (patch: Partial<ChatStoreState>) => {
    state = { ...state, ...patch };
    notify();
  };

  return {
    getState: () => state,
    subscribe: (fn: (s: ChatStoreState) => void) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },

    /** Load all conversations for the workspace. */
    loadConversations: async (api: ApiClient) => {
      update({ loading: true });
      try {
        const data = await api.getConversations();
        const convs = (data.conversations ?? []).map((c) => ({
          ...c,
          unreadCount: c.unreadCount ?? 0,
        }));
        update({ conversations: convs, loading: false });
        // Auto-select first if none selected.
        if (!state.activeConversationId && convs.length > 0) {
          update({ activeConversationId: convs[0].id });
        }
      } catch {
        update({ loading: false });
      }
    },

    /** Select a conversation and load its messages. */
    selectConversation: async (conversationId: string, api: ApiClient) => {
      update({ activeConversationId: conversationId, messages: [], nextBeforeId: null, loading: true });
      try {
        const data = await api.getMessages(conversationId);
        const messages = (data.items ?? []).map(normalizeMessage);
        update({ messages, nextBeforeId: data.nextBeforeId, loading: false });
      } catch {
        update({ loading: false });
      }
    },

    /** Load older messages (pagination). */
    loadOlderMessages: async (api: ApiClient) => {
      if (!state.activeConversationId || !state.nextBeforeId || state.loading) return;
      update({ loading: true });
      try {
        const data = await api.getMessages(state.activeConversationId);
        const older = (data.items ?? []).map(normalizeMessage);
        update({
          messages: [...older, ...state.messages],
          nextBeforeId: data.nextBeforeId,
          loading: false,
        });
      } catch {
        update({ loading: false });
      }
    },

    /** Send a message (optimistic). */
    sendMessage: async (conversationId: string, payload: unknown, api: ApiClient) => {
      // Optimistic append with "sending" status.
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const p = payload as Record<string, unknown>;
      const content = p.content as { type: string; text: string } | undefined;
      const optimistic: ChatMessageItem = {
        id: tempId,
        conversationId,
        senderId: (p.senderId as string) ?? '',
        content: content ?? { type: 'text', text: '' },
        status: 'sending',
        createdAt: Date.now(),
        isAi: (p.isAi as boolean) ?? false,
      };
      update({ messages: [...state.messages, optimistic] });

      try {
        await api.sendMessage(conversationId, payload);
        // Backend will publish chat.delta → applyRealtimeEvent will update.
        // Remove optimistic message (replaced by real one from delta).
        update({
          messages: state.messages.filter((m) => m.id !== tempId),
        });
      } catch {
        // Mark as failed.
        update({
          messages: state.messages.map((m) =>
            m.id === tempId ? { ...m, status: 'failed' } : m
          ),
        });
      }
    },

    /** Apply a realtime event (chat.delta, chat.status, chat.snapshot). */
    applyRealtimeEvent: (event: { type: string; payload: Record<string, unknown> }) => {
      const p = event.payload;
      const eventType = (event.type ?? p.event ?? '') as string;

      switch (eventType) {
        case 'chat.delta': {
          const convId = p.conversationId as string;
          const msgId = p.messageId as string;
          const body = p.body as string;
          const seq = p.sequence as number;

          // Only append if for the active conversation.
          if (convId === state.activeConversationId) {
            // Dedup: skip if already have this message.
            if (!state.messages.some((m) => m.id === msgId)) {
              const newMsg: ChatMessageItem = {
                id: msgId,
                conversationId: convId,
                senderId: (p.senderId as string) ?? '',
                content: { type: 'text', text: body },
                status: 'sent',
                createdAt: Date.now(),
                seq,
                mode: 'delta',
              };
              update({ messages: [...state.messages, newMsg] });
            }
          }

          // Update conversation preview + unread.
          const updatedConvs = state.conversations.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              lastMessagePreview: body?.slice(0, 120),
              lastMessageAt: Date.now(),
              unreadCount: convId === state.activeConversationId ? c.unreadCount : c.unreadCount + 1,
            };
          });
          const unread = { ...state.unreadByConversation };
          if (convId !== state.activeConversationId) {
            unread[convId] = (unread[convId] ?? 0) + 1;
          }
          const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
          update({ conversations: updatedConvs, unreadByConversation: unread, totalUnread });
          break;
        }

        case 'chat.status': {
          const msgId = p.messageId as string;
          const status = p.status as string;
          update({
            messages: state.messages.map((m) =>
              m.id === msgId ? { ...m, status } : m
            ),
          });
          break;
        }

        case 'chat.snapshot': {
          // Full snapshot replace — not commonly used except on reconnect.
          // For now, trigger a reload.
          break;
        }
      }
    },

    /** Mark a conversation as read. */
    markRead: async (workspaceId: string, conversationId: string, memberId: string, api: ApiClient) => {
      const lastMsg = state.messages[state.messages.length - 1];
      if (!lastMsg) return;

      const unread = { ...state.unreadByConversation };
      delete unread[conversationId];
      const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
      const updatedConvs = state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      );
      update({ unreadByConversation: unread, totalUnread, conversations: updatedConvs });

      try {
        await api.markMessagesRead?.(workspaceId, conversationId, memberId, lastMsg.id);
      } catch {
        // Optimistic update already applied.
      }
    },

    /** Reset state. */
    reset: () => {
      state = { ...initialState };
      notify();
    },
  };
};

function normalizeMessage(raw: ChatMessageItem): ChatMessageItem {
  return {
    ...raw,
    content: raw.content ?? { type: 'text', text: '' },
    status: raw.status ?? 'sent',
    createdAt: raw.createdAt ?? Date.now(),
  };
}
