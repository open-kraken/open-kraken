import { useEffect, useMemo, useState } from 'react';
import workspaceFixture from '../../../../backend/tests/fixtures/workspace-fixture.json';
import type { ChatConversation, ChatMessagePageResponse } from '@/api/api-client';
import { useAppShell, type RealtimeStatus } from '@/state/app-shell-store';

type ChatPageRealtimeState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'degraded';
type ComposerStatus = 'idle' | 'sending' | 'failed';

export type ChatPageFeedbackOverride = {
  composerErrorMessage?: string | null;
  composerStatus?: ComposerStatus;
  isSwitchingConversation?: boolean;
};

type ConversationRouteItem = {
  id: string;
  preview: string;
  title: string;
  unreadCount: number;
};

type MessageRouteItem = {
  content: string;
  id: string;
  senderId: string;
  status: string;
};

type ChatPageRouteModel = {
  activeConversationId: string | null;
  composer: {
    disabled: boolean;
    status: ComposerStatus;
  };
  conversations: ConversationRouteItem[];
  messages: MessageRouteItem[];
  pageNotice: {
    code: 'switching' | 'composer-failed' | 'idle' | 'connecting' | 'reconnecting' | 'degraded' | 'live';
    message: string;
    tone: 'live' | 'muted' | 'pending' | 'warning' | 'danger';
  };
  realtime: {
    detail: string;
    state: ChatPageRealtimeState;
  };
  workspaceId: string;
};

type ChatRouteData = {
  conversationItems: ChatConversation[];
  messagePage: ChatMessagePageResponse;
};

type ChatRealtimeEvent = {
  body?: string;
  messageId?: string;
  status?: string;
};

const fixtureConversationItems = workspaceFixture.conversations;
const fixtureMessageMap = workspaceFixture.messages as Record<string, Array<{
  content?: { text?: string };
  createdAt?: number;
  id: string;
  senderId?: string;
  status?: string;
}>>;

const mapShellRealtimeState = (status: RealtimeStatus): ChatPageRealtimeState => {
  switch (status) {
    case 'connected':
      return 'live';
    case 'connecting':
      return 'connecting';
    case 'reconnecting':
      return 'reconnecting';
    case 'idle':
      return 'idle';
    case 'stale':
    case 'disconnected':
    default:
      return 'degraded';
  }
};

const buildPageNotice = ({
  composerErrorMessage,
  composerStatus,
  isSwitchingConversation,
  realtimeState
}: {
  composerErrorMessage: string | null;
  composerStatus: ComposerStatus;
  isSwitchingConversation: boolean;
  realtimeState: ChatPageRealtimeState;
}): ChatPageRouteModel['pageNotice'] => {
  if (isSwitchingConversation) {
    return {
      code: 'switching',
      message: 'Switching conversations. Sending stays paused until the next channel is ready.',
      tone: 'pending'
    };
  }

  if (composerStatus === 'failed') {
    return {
      code: 'composer-failed',
      message: composerErrorMessage ?? 'Message delivery failed. Retry after connection recovery.',
      tone: 'danger'
    };
  }

  switch (realtimeState) {
    case 'idle':
      return {
        code: 'idle',
        message: 'Realtime is idle. Sending is unavailable until the connection starts.',
        tone: 'muted'
      };
    case 'connecting':
      return {
        code: 'connecting',
        message: 'Connecting to realtime. Sending is temporarily unavailable.',
        tone: 'pending'
      };
    case 'reconnecting':
      return {
        code: 'reconnecting',
        message: 'Realtime is reconnecting. Browsing stays available, but sending is paused.',
        tone: 'warning'
      };
    case 'degraded':
      return {
        code: 'degraded',
        message: 'Realtime is degraded. Browsing stays available, but sending is temporarily unavailable.',
        tone: 'danger'
      };
    case 'live':
    default:
      return {
        code: 'live',
        message: 'Chat is live.',
        tone: 'live'
      };
  }
};

const buildFixtureMessagePage = (conversationId: string | null): ChatMessagePageResponse => ({
  items:
    conversationId === null
      ? []
      : (fixtureMessageMap[conversationId] ?? []).map((message) => ({
          id: message.id,
          senderId: message.senderId,
          content: message.content,
          createdAt: message.createdAt,
          status: message.status
        })),
  nextBeforeId: null
});

export const buildChatPageRouteModel = ({
  composerErrorMessage = null,
  composerStatus = 'idle',
  conversationItems,
  isSwitchingConversation = false,
  messagePage,
  realtimeDetail,
  realtimeStatus,
  workspaceId
}: {
  composerErrorMessage?: string | null;
  composerStatus?: ComposerStatus;
  conversationItems: ChatConversation[];
  isSwitchingConversation?: boolean;
  messagePage: ChatMessagePageResponse;
  realtimeDetail: string;
  realtimeStatus: RealtimeStatus;
  workspaceId: string;
}): ChatPageRouteModel => {
  const conversations = conversationItems.map((conversation) => ({
    id: conversation.id,
    preview: conversation.lastMessagePreview ?? '',
    title: conversation.customName ?? conversation.id,
    unreadCount: conversation.unreadCount ?? 0
  }));
  const activeConversationId = conversations[0]?.id ?? null;
  const messages = (messagePage.items ?? []).map((message) => ({
    content: message.content?.text ?? '',
    id: message.id,
    senderId: message.senderId ?? 'unknown',
    status: message.status ?? 'sent'
  }));
  const realtimeState = mapShellRealtimeState(realtimeStatus);
  const composerDisabled =
    activeConversationId === null ||
    isSwitchingConversation ||
    composerStatus === 'sending' ||
    realtimeState !== 'live';

  return {
    activeConversationId,
    composer: {
      disabled: composerDisabled,
      status: composerStatus
    },
    conversations,
    messages,
    pageNotice: buildPageNotice({
      composerErrorMessage,
      composerStatus,
      isSwitchingConversation,
      realtimeState
    }),
    realtime: {
      detail: realtimeDetail,
      state: realtimeState
    },
    workspaceId
  };
};

export const loadChatRouteData = async (apiClient: {
  getConversations: () => Promise<{ conversations: ChatConversation[] }>;
  getMessages: (conversationId: string) => Promise<ChatMessagePageResponse>;
}): Promise<ChatRouteData> => {
  const conversationsResponse = await apiClient.getConversations();
  const conversationItems = conversationsResponse.conversations;
  const activeConversationId = conversationItems[0]?.id ?? null;
  const messagePage =
    activeConversationId === null ? { items: [], nextBeforeId: null } : await apiClient.getMessages(activeConversationId);

  return {
    conversationItems,
    messagePage
  };
};

export const ChatPage = ({ feedbackOverride }: { feedbackOverride?: ChatPageFeedbackOverride }) => {
  const { apiClient, realtime, realtimeClient, workspace } = useAppShell();
  const [conversationItems, setConversationItems] = useState<ChatConversation[]>(fixtureConversationItems);
  const [messagePage, setMessagePage] = useState<ChatMessagePageResponse>(
    buildFixtureMessagePage(fixtureConversationItems[0]?.id ?? null)
  );
  const [composerState, setComposerState] = useState<{
    errorMessage: string | null;
    status: ComposerStatus;
  }>({
    errorMessage: feedbackOverride?.composerErrorMessage ?? null,
    status: feedbackOverride?.composerStatus ?? 'idle'
  });

  useEffect(() => {
    let cancelled = false;

    void loadChatRouteData(apiClient)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setConversationItems(data.conversationItems);
        setMessagePage(data.messagePage);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setConversationItems(fixtureConversationItems);
        setMessagePage(buildFixtureMessagePage(fixtureConversationItems[0]?.id ?? null));
      });

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  useEffect(() => {
    setComposerState({
      errorMessage: feedbackOverride?.composerErrorMessage ?? null,
      status: feedbackOverride?.composerStatus ?? 'idle'
    });
  }, [feedbackOverride?.composerErrorMessage, feedbackOverride?.composerStatus]);

  useEffect(() => {
    const subscription = realtimeClient.subscribe<ChatRealtimeEvent>('workspace.chat', (event) => {
      if (event.type === 'chat.delta' && event.payload?.messageId) {
        setMessagePage((current) => ({
          ...current,
          items: [
            ...current.items,
            {
              id: event.payload.messageId ?? `msg_${Date.now()}`,
              senderId: 'unknown',
              content: { type: 'text', text: event.payload.body ?? '' },
              createdAt: Date.now(),
              status: 'sent'
            }
          ]
        }));
      }

      if (event.type === 'chat.status' && event.payload?.status === 'failed') {
        setComposerState({
          errorMessage: 'Message delivery failed. Retry after connection recovery.',
          status: 'failed'
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [realtimeClient]);

  const model = buildChatPageRouteModel({
    composerErrorMessage: composerState.errorMessage,
    composerStatus: composerState.status,
    conversationItems,
    isSwitchingConversation: feedbackOverride?.isSwitchingConversation,
    messagePage,
    realtimeDetail: realtime.detail,
    realtimeStatus: realtime.status,
    workspaceId: workspace.workspaceId
  });

  const pageMeta = useMemo(
    () => ({
      conversationCount: model.conversations.length,
      messageCount: model.messages.length
    }),
    [model.conversations.length, model.messages.length]
  );

  return (
    <section className="page-card chat-route-page" data-route-page="chat" data-page-notice={model.pageNotice.code}>
      <header className="chat-route-page__header">
        <div>
          <p className="page-eyebrow">Chat</p>
          <h1>Conversation workspace for {model.workspaceId}</h1>
        </div>
        <p className="page-meta">Realtime detail: {model.realtime.detail}</p>
        <p className="page-meta">
          Loaded conversations: {pageMeta.conversationCount} | Loaded messages: {pageMeta.messageCount}
        </p>
      </header>

      <div className={`chat-route-page__notice chat-route-page__notice--${model.pageNotice.tone}`}>
        <strong>Page status</strong>
        <p>{model.pageNotice.message}</p>
      </div>

      <div className="chat-route-page__layout">
        <aside className="chat-route-page__conversations" data-chat-slot="conversations">
          <h2>Conversations</h2>
          {model.conversations.map((conversation) => (
            <article
              key={conversation.id}
              className="chat-route-page__conversation"
              data-conversation-active={String(conversation.id === model.activeConversationId)}
            >
              <strong>{conversation.title}</strong>
              <span>{conversation.preview}</span>
              <small>Unread: {conversation.unreadCount}</small>
            </article>
          ))}
        </aside>

        <section className="chat-route-page__messages" data-chat-slot="messages">
          <header className="chat-route-page__messages-header">
            <h2>{model.activeConversationId ?? 'No conversation selected'}</h2>
            <span data-chat-realtime={model.realtime.state}>{model.realtime.state}</span>
          </header>
          {model.messages.length === 0 ? (
            <p>No messages in this conversation yet.</p>
          ) : (
            model.messages.map((message) => (
              <article key={message.id} className="chat-route-page__message" data-message-status={message.status}>
                <strong>{message.senderId}</strong>
                <p>{message.content}</p>
              </article>
            ))
          )}
        </section>

        <section className="chat-route-page__composer" data-chat-slot="composer">
          <h2>Composer</h2>
          <textarea defaultValue="" placeholder="Message draft placeholder" readOnly />
          <button type="button" disabled={model.composer.disabled}>
            {model.composer.status === 'sending' ? 'Sending…' : 'Send'}
          </button>
        </section>
      </div>
    </section>
  );
};
