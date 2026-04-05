export const REALTIME_STATE_META = {
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

const FALLBACK_REALTIME_STATE = 'idle';

export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const normalizeRealtimeState = (state) => {
  if (state && REALTIME_STATE_META[state]) {
    return state;
  }
  return FALLBACK_REALTIME_STATE;
};

export const getRealtimeStateMeta = (state) => {
  const normalized = normalizeRealtimeState(state);
  return {
    key: normalized,
    ...REALTIME_STATE_META[normalized]
  };
};

export const getActiveConversation = (conversationItems, activeConversationId) => {
  if (!Array.isArray(conversationItems) || conversationItems.length === 0) {
    return null;
  }
  return (
    conversationItems.find((conversation) => conversation.id === activeConversationId) ??
    conversationItems.find((conversation) => conversation.isDefault) ??
    conversationItems[0]
  );
};

export const normalizeMessagePage = (messagePage) => ({
  items: Array.isArray(messagePage?.items) ? messagePage.items : [],
  error: messagePage?.error ? String(messagePage.error) : null,
  hasOlderMessages: Boolean(messagePage?.hasOlderMessages),
  isLoadingOlder: Boolean(messagePage?.isLoadingOlder)
});

export const normalizeComposerState = (composerState) => ({
  draft: String(composerState?.draft ?? ''),
  status: composerState?.status ?? 'idle',
  errorMessage: composerState?.errorMessage ? String(composerState.errorMessage) : null
});

export const getPageNotice = ({ isSwitchingConversation, realtimeState, composerState }) => {
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

export const getComposerAvailability = ({
  composerState,
  hasActiveConversation,
  isSwitchingConversation,
  realtimeState
}) => {
  if (!hasActiveConversation) {
    return {
      disabled: true,
      reason: 'no-conversation'
    };
  }
  if (isSwitchingConversation) {
    return {
      disabled: true,
      reason: 'switching'
    };
  }
  if (composerState.status === 'sending') {
    return {
      disabled: true,
      reason: 'sending'
    };
  }
  const realtimeMeta = getRealtimeStateMeta(realtimeState);
  if (realtimeMeta.blocksComposer) {
    return {
      disabled: true,
      reason: realtimeMeta.key
    };
  }
  return {
    disabled: false,
    reason: null
  };
};
