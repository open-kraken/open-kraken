import {
  getActiveConversation,
  getComposerAvailability,
  getPageNotice,
  normalizeComposerState,
  normalizeMessagePage,
  escapeHtml
} from '../../features/chat/contracts.mjs';
import { buildConversationListView, renderConversationList } from '../../features/chat/ConversationList.mjs';
import { buildChatHeaderView, renderChatHeader } from '../../features/chat/ChatHeader.mjs';
import {
  buildRealtimeStatusPlaceholderView,
  renderRealtimeStatusPlaceholder
} from '../../features/chat/RealtimeStatusPlaceholder.mjs';
import { buildMessageListView, renderMessageList } from '../../features/chat/MessageList.mjs';
import { buildMessageComposerView, renderMessageComposer } from '../../features/chat/MessageComposer.mjs';

export const buildChatPageView = ({
  workspaceId,
  conversationItems = [],
  activeConversationId = null,
  isSwitchingConversation = false,
  messagePage,
  composerState,
  realtimeState = 'idle',
  onConversationSelect,
  onComposerChange,
  onComposerSubmit,
  onComposerRetry
}) => {
  const activeConversation = getActiveConversation(conversationItems, activeConversationId);
  const normalizedMessagePage = normalizeMessagePage(messagePage);
  const normalizedComposerState = normalizeComposerState(composerState);
  const composerAvailability = getComposerAvailability({
    composerState: normalizedComposerState,
    hasActiveConversation: Boolean(activeConversation),
    isSwitchingConversation,
    realtimeState
  });
  const pageNotice = getPageNotice({
    isSwitchingConversation,
    realtimeState,
    composerState: normalizedComposerState
  });

  const conversationList = buildConversationListView({
    conversationItems,
    activeConversationId: activeConversation?.id ?? null,
    isSwitchingConversation,
    onConversationSelect
  });
  const header = buildChatHeaderView({ activeConversation, isSwitchingConversation });
  const realtime = buildRealtimeStatusPlaceholderView({ realtimeState });
  const messageList = buildMessageListView({ activeConversation, messagePage: normalizedMessagePage });
  const composer = buildMessageComposerView({
    composerState: normalizedComposerState,
    composerAvailability,
    onComposerChange,
    onComposerSubmit,
    onComposerRetry
  });

  return {
    workspaceId,
    activeConversationId: activeConversation?.id ?? null,
    pageNotice,
    conversationList,
    header,
    realtime,
    messageList,
    composer
  };
};

export const renderChatPage = (view) => `ChatPage:${escapeHtml(view.workspaceId ?? 'unknown')}
conversation=${escapeHtml(view.activeConversationId ?? 'none')}
page-notice=${escapeHtml(view.pageNotice.code)}
page-notice-tone=${escapeHtml(view.pageNotice.tone)}
page-notice-message=${escapeHtml(view.pageNotice.message)}
${renderChatHeader(view.header)}
${renderRealtimeStatusPlaceholder(view.realtime)}
${renderConversationList(view.conversationList)}
${renderMessageList(view.messageList)}
${renderMessageComposer(view.composer)}`;
