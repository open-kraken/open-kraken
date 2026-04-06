import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatConversation, ChatMessagePageResponse } from '@/api/api-client';
import { useI18n } from '@/i18n/I18nProvider';
import { translateRealtimeDetail } from '@/i18n/realtime-copy';
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
  createdAt?: number;
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
  senderId?: string;
  status?: string;
};

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
  composerStatus,
  isSwitchingConversation,
  realtimeState
}: {
  composerStatus: ComposerStatus;
  isSwitchingConversation: boolean;
  realtimeState: ChatPageRealtimeState;
}): ChatPageRouteModel['pageNotice'] => {
  if (isSwitchingConversation) {
    return {
      code: 'switching',
      tone: 'pending'
    };
  }

  if (composerStatus === 'failed') {
    return {
      code: 'composer-failed',
      tone: 'danger'
    };
  }

  switch (realtimeState) {
    case 'idle':
      return {
        code: 'idle',
        tone: 'muted'
      };
    case 'connecting':
      return {
        code: 'connecting',
        tone: 'pending'
      };
    case 'reconnecting':
      return {
        code: 'reconnecting',
        tone: 'warning'
      };
    case 'degraded':
      return {
        code: 'degraded',
        tone: 'danger'
      };
    case 'live':
    default:
      return {
        code: 'live',
        tone: 'live'
      };
  }
};

export const buildChatPageRouteModel = ({
  composerErrorMessage = null,
  composerStatus = 'idle',
  conversationItems,
  isSwitchingConversation = false,
  messagePage,
  realtimeDetail,
  realtimeStatus,
  workspaceId,
  activeConversationIdOverride
}: {
  composerErrorMessage?: string | null;
  composerStatus?: ComposerStatus;
  conversationItems: ChatConversation[];
  isSwitchingConversation?: boolean;
  messagePage: ChatMessagePageResponse;
  realtimeDetail: string;
  realtimeStatus: RealtimeStatus;
  workspaceId: string;
  activeConversationIdOverride?: string | null;
}): ChatPageRouteModel => {
  const conversations = conversationItems.map((conversation) => ({
    id: conversation.id,
    preview: conversation.lastMessagePreview ?? '',
    title: conversation.customName ?? conversation.id,
    unreadCount: conversation.unreadCount ?? 0
  }));
  const activeConversationId = activeConversationIdOverride ?? conversations[0]?.id ?? null;
  const messages = (messagePage.items ?? []).map((message) => ({
    content: message.content?.text ?? '',
    id: message.id,
    senderId: message.senderId ?? 'unknown',
    status: message.status ?? 'sent',
    createdAt: message.createdAt
  }));
  const realtimeState = mapShellRealtimeState(realtimeStatus);
  const composerDisabled =
    activeConversationId === null ||
    isSwitchingConversation ||
    composerStatus === 'sending';

  return {
    activeConversationId,
    composer: {
      disabled: composerDisabled,
      status: composerStatus
    },
    conversations,
    messages,
    pageNotice: buildPageNotice({
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

const chatNoticeCopy = (
  code: ChatPageRouteModel['pageNotice']['code'],
  t: (k: string) => string,
  composerError: string | null
) => {
  if (code === 'composer-failed') {
    return composerError ?? t('chat.composerFailedDefault');
  }
  switch (code) {
    case 'switching':
      return t('chat.notice.switching');
    case 'idle':
      return t('chat.notice.idle');
    case 'connecting':
      return t('chat.notice.connecting');
    case 'reconnecting':
      return t('chat.notice.reconnecting');
    case 'degraded':
      return t('chat.notice.degraded');
    case 'live':
    default:
      return t('chat.notice.live');
  }
};

/** Format a unix-ms timestamp to a short time string. */
const formatTime = (ts?: number) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const ChatPage = ({ feedbackOverride }: { feedbackOverride?: ChatPageFeedbackOverride }) => {
  const { t } = useI18n();
  const { apiClient, realtime, realtimeClient, workspace } = useAppShell();
  const [conversationItems, setConversationItems] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messagePage, setMessagePage] = useState<ChatMessagePageResponse>({ items: [], nextBeforeId: null });
  const [composerState, setComposerState] = useState<{
    errorMessage: string | null;
    status: ComposerStatus;
  }>({
    errorMessage: feedbackOverride?.composerErrorMessage ?? null,
    status: feedbackOverride?.composerStatus ?? 'idle'
  });
  const [composerText, setComposerText] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagePage.items.length]);

  // Initial data load
  useEffect(() => {
    let cancelled = false;

    void loadChatRouteData(apiClient)
      .then((data) => {
        if (cancelled) return;
        setConversationItems(data.conversationItems);
        const firstId = data.conversationItems[0]?.id ?? null;
        setActiveConvId(firstId);
        setMessagePage(data.messagePage);
      });

    return () => { cancelled = true; };
  }, [apiClient]);

  // Sync feedbackOverride
  useEffect(() => {
    setComposerState({
      errorMessage: feedbackOverride?.composerErrorMessage ?? null,
      status: feedbackOverride?.composerStatus ?? 'idle'
    });
  }, [feedbackOverride?.composerErrorMessage, feedbackOverride?.composerStatus]);

  // Realtime events
  useEffect(() => {
    const subscription = realtimeClient.subscribe<ChatRealtimeEvent>('workspace.chat', (event) => {
      if (event.type === 'chat.delta' && event.payload?.messageId) {
        setMessagePage((current) => ({
          ...current,
          items: [
            ...current.items,
            {
              id: event.payload.messageId ?? `msg_${Date.now()}`,
              senderId: event.payload.senderId ?? 'unknown',
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

    return () => { subscription.unsubscribe(); };
  }, [realtimeClient]);

  /** Switch to a different conversation. */
  const switchConversation = useCallback(async (conversationId: string) => {
    if (conversationId === activeConvId) return;
    setIsSwitching(true);
    setActiveConvId(conversationId);
    try {
      const page = await apiClient.getMessages(conversationId);
      setMessagePage(page);
    } finally {
      setIsSwitching(false);
    }
  }, [activeConvId, apiClient]);

  /** Send a message via the API. */
  const sendMessage = useCallback(async () => {
    const text = composerText.trim();
    if (!text || !activeConvId) return;

    setComposerState({ errorMessage: null, status: 'sending' });

    // Optimistic: append the message locally before the API responds
    const optimisticId = `local_${Date.now()}`;
    setMessagePage((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: optimisticId,
          senderId: 'owner_1',
          content: { type: 'text', text },
          createdAt: Date.now(),
          status: 'sending'
        }
      ]
    }));
    setComposerText('');

    try {
      await apiClient.sendMessage(activeConvId, {
        senderId: 'owner_1',
        content: { type: 'text', text },
        isAI: false
      });
      // Mark the optimistic message as sent
      setMessagePage((current) => ({
        ...current,
        items: current.items.map((m) =>
          m.id === optimisticId ? { ...m, status: 'sent' } : m
        )
      }));
      setComposerState({ errorMessage: null, status: 'idle' });
    } catch (err) {
      // Mark message as failed and show error
      setMessagePage((current) => ({
        ...current,
        items: current.items.map((m) =>
          m.id === optimisticId ? { ...m, status: 'failed' } : m
        )
      }));
      setComposerState({
        errorMessage: err instanceof Error ? err.message : 'Send failed',
        status: 'failed'
      });
    }
  }, [composerText, activeConvId, apiClient]);

  /** Handle Enter key in composer (Shift+Enter for newline). */
  const handleComposerKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  /** Retry sending after a failure — reset composer state. */
  const handleRetry = useCallback(() => {
    setComposerState({ errorMessage: null, status: 'idle' });
  }, []);

  const model = buildChatPageRouteModel({
    composerErrorMessage: composerState.errorMessage,
    composerStatus: composerState.status,
    conversationItems,
    isSwitchingConversation: isSwitching || feedbackOverride?.isSwitchingConversation,
    messagePage,
    realtimeDetail: realtime.detail,
    realtimeStatus: realtime.status,
    workspaceId: workspace.workspaceId,
    activeConversationIdOverride: activeConvId
  });

  const pageMeta = useMemo(
    () => ({
      conversationCount: model.conversations.length,
      messageCount: model.messages.length
    }),
    [model.conversations.length, model.messages.length]
  );

  const noticeMessage = useMemo(
    () => chatNoticeCopy(model.pageNotice.code, t, composerState.errorMessage),
    [model.pageNotice.code, t, composerState.errorMessage]
  );

  const realtimeStateLabel = t(`chat.state.${model.realtime.state}`);

  return (
    <section className="page-card chat-route-page" data-route-page="chat" data-page-notice={model.pageNotice.code}>
      <header className="chat-route-page__header">
        <div>
          <p className="page-eyebrow">{t('chat.eyebrow')}</p>
          <h1>{t('chat.title', { workspaceId: model.workspaceId })}</h1>
        </div>
        <p className="page-meta">{t('chat.metaRealtime', { detail: translateRealtimeDetail(model.realtime.detail, t) })}</p>
        <p className="page-meta">
          {t('chat.metaLoaded', { conv: pageMeta.conversationCount, msg: pageMeta.messageCount })}
        </p>
      </header>

      <div className={`chat-route-page__notice chat-route-page__notice--${model.pageNotice.tone}`}>
        <strong>{t('chat.pageStatus')}</strong>
        <p>{noticeMessage}</p>
      </div>

      <div className="chat-route-page__layout">
        <aside className="chat-route-page__conversations" data-chat-slot="conversations">
          <h2>{t('chat.conversations')}</h2>
          {model.conversations.length === 0 ? (
            <p className="chat-route-page__empty">{t('chat.noConversations')}</p>
          ) : (
            model.conversations.map((conversation) => (
              <article
                key={conversation.id}
                className="chat-route-page__conversation"
                data-conversation-active={String(conversation.id === model.activeConversationId)}
                role="button"
                tabIndex={0}
                onClick={() => void switchConversation(conversation.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void switchConversation(conversation.id);
                  }
                }}
              >
                <strong>{conversation.title}</strong>
                <span>{conversation.preview}</span>
                {conversation.unreadCount > 0 && (
                  <small className="chat-route-page__unread">{t('chat.unread', { count: conversation.unreadCount })}</small>
                )}
              </article>
            ))
          )}
        </aside>

        <section className="chat-route-page__messages" data-chat-slot="messages">
          <header className="chat-route-page__messages-header">
            <h2>{model.activeConversationId ?? t('chat.noConversation')}</h2>
            <span data-chat-realtime={model.realtime.state}>{realtimeStateLabel}</span>
          </header>

          {isSwitching ? (
            <p className="chat-route-page__loading">{t('chat.loadingMessages')}</p>
          ) : model.messages.length === 0 ? (
            <p className="chat-route-page__empty">{t('chat.noMessages')}</p>
          ) : (
            <div className="chat-route-page__message-list">
              {model.messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-route-page__message chat-route-page__message--${message.status}`}
                  data-message-status={message.status}
                  data-sender={message.senderId}
                >
                  <div className="chat-route-page__message-meta">
                    <strong>{message.senderId}</strong>
                    {message.createdAt && (
                      <time className="chat-route-page__message-time">{formatTime(message.createdAt)}</time>
                    )}
                  </div>
                  <p>{message.content}</p>
                  {message.status === 'failed' && (
                    <small className="chat-route-page__message-failed">{t('chat.messageFailed')}</small>
                  )}
                  {message.status === 'sending' && (
                    <small className="chat-route-page__message-sending">{t('chat.messageSending')}</small>
                  )}
                </article>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <section className="chat-route-page__composer" data-chat-slot="composer">
          <h2>{t('chat.composer')}</h2>
          <textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={t('chat.placeholder')}
            disabled={model.composer.disabled}
            rows={3}
            aria-label={t('chat.composerAria')}
          />
          <div className="chat-route-page__composer-actions">
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={model.composer.disabled || composerText.trim().length === 0}
            >
              {model.composer.status === 'sending' ? t('chat.sending') : t('chat.send')}
            </button>
            {model.composer.status === 'failed' && (
              <button type="button" className="chat-route-page__retry" onClick={handleRetry}>
                {t('chat.retry')}
              </button>
            )}
          </div>
          {composerState.errorMessage && (
            <p className="chat-route-page__composer-error">{composerState.errorMessage}</p>
          )}
          <small className="chat-route-page__composer-hint">{t('chat.composerHint')}</small>
        </section>
      </div>
    </section>
  );
};
