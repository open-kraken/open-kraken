export type RealtimeStateKey = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'degraded';

type RealtimeStateMeta = {
  label: string;
  tone: string;
  affectsComposer: boolean;
  blocksComposer: boolean;
  pageNotice: string | null;
};

export const REALTIME_STATE_META: Record<RealtimeStateKey, RealtimeStateMeta> = {
  idle: {
    label: 'Idle',
    tone: 'muted',
    affectsComposer: true,
    blocksComposer: true,
    pageNotice: 'Realtime is idle. Sending is unavailable until the connection starts.'
  },
  connecting: {
    label: 'Connecting',
    tone: 'pending',
    affectsComposer: true,
    blocksComposer: true,
    pageNotice: 'Connecting to realtime. Sending is temporarily unavailable.'
  },
  live: {
    label: 'Live',
    tone: 'live',
    affectsComposer: false,
    blocksComposer: false,
    pageNotice: null
  },
  reconnecting: {
    label: 'Reconnecting',
    tone: 'warning',
    affectsComposer: true,
    blocksComposer: true,
    pageNotice: 'Realtime is reconnecting. Browsing stays available, but sending is paused.'
  },
  degraded: {
    label: 'Degraded',
    tone: 'danger',
    affectsComposer: true,
    blocksComposer: true,
    pageNotice: 'Realtime is degraded. Browsing stays available, but sending is temporarily unavailable.'
  }
};

const FALLBACK_REALTIME_STATE: RealtimeStateKey = 'idle';

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const normalizeRealtimeState = (state: string | null | undefined): RealtimeStateKey => {
  if (state && state in REALTIME_STATE_META) {
    return state as RealtimeStateKey;
  }
  return FALLBACK_REALTIME_STATE;
};

export const getRealtimeStateMeta = (state: string | null | undefined) => {
  const normalized = normalizeRealtimeState(state);
  return {
    key: normalized,
    ...REALTIME_STATE_META[normalized]
  };
};

export type ConversationItem = {
  id: string;
  title?: string;
  customName?: string;
  subtitle?: string;
  type?: string;
  isDefault?: boolean;
  lastMessagePreview?: string;
  unreadCount?: number;
};

export type MessageItem = {
  id: string;
  senderId?: string;
  senderName?: string;
  content?: string;
  text?: string;
  status?: string;
};

export type MessagePage = {
  items: MessageItem[];
  error?: string | null;
  hasOlderMessages?: boolean;
  isLoadingOlder?: boolean;
};

export type ComposerState = {
  draft?: string;
  status?: string;
  errorMessage?: string | null;
};

export type PageNotice = {
  code: string;
  tone: string;
  message: string;
};

export const getActiveConversation = (conversationItems: ConversationItem[], activeConversationId: string | null): ConversationItem | null => {
  if (!Array.isArray(conversationItems) || conversationItems.length === 0) {
    return null;
  }
  return (
    conversationItems.find((conversation) => conversation.id === activeConversationId) ??
    conversationItems.find((conversation) => conversation.isDefault) ??
    conversationItems[0]
  );
};

export const normalizeMessagePage = (messagePage: MessagePage | undefined) => ({
  items: Array.isArray(messagePage?.items) ? messagePage!.items : [],
  error: messagePage?.error ? String(messagePage.error) : null,
  hasOlderMessages: Boolean(messagePage?.hasOlderMessages),
  isLoadingOlder: Boolean(messagePage?.isLoadingOlder)
});

export const normalizeComposerState = (composerState: ComposerState | undefined) => ({
  draft: String(composerState?.draft ?? ''),
  status: composerState?.status ?? 'idle',
  errorMessage: composerState?.errorMessage ? String(composerState.errorMessage) : null
});

type PageNoticeInput = {
  isSwitchingConversation: boolean;
  realtimeState: string;
  composerState: ReturnType<typeof normalizeComposerState>;
};

export const getPageNotice = ({ isSwitchingConversation, realtimeState, composerState }: PageNoticeInput): PageNotice => {
  if (isSwitchingConversation) {
    return {
      code: 'switching',
      tone: 'pending',
      message: 'Switching conversations. Sending stays paused until the next channel is ready.'
    };
  }
  if (composerState.status === 'failed' && composerState.errorMessage) {
    return {
      code: 'composer-failed',
      tone: 'danger',
      message: composerState.errorMessage
    };
  }
  const realtimeMeta = getRealtimeStateMeta(realtimeState);
  if (realtimeMeta.pageNotice) {
    return {
      code: realtimeMeta.key,
      tone: realtimeMeta.tone,
      message: realtimeMeta.pageNotice
    };
  }
  return {
    code: 'live',
    tone: 'live',
    message: 'Chat is live.'
  };
};

type ComposerAvailabilityInput = {
  composerState: ReturnType<typeof normalizeComposerState>;
  hasActiveConversation: boolean;
  isSwitchingConversation: boolean;
  realtimeState: string;
};

export type ComposerAvailability = {
  disabled: boolean;
  reason: string | null;
};

export const getComposerAvailability = ({
  composerState,
  hasActiveConversation,
  isSwitchingConversation,
  realtimeState
}: ComposerAvailabilityInput): ComposerAvailability => {
  if (!hasActiveConversation) {
    return { disabled: true, reason: 'no-conversation' };
  }
  if (isSwitchingConversation) {
    return { disabled: true, reason: 'switching' };
  }
  if (composerState.status === 'sending') {
    return { disabled: true, reason: 'sending' };
  }
  const realtimeMeta = getRealtimeStateMeta(realtimeState);
  if (realtimeMeta.blocksComposer) {
    return { disabled: true, reason: realtimeMeta.key };
  }
  return { disabled: false, reason: null };
};
