import {
  getActiveConversation,
  getComposerAvailability,
  getPageNotice,
  normalizeComposerState,
  normalizeMessagePage,
  escapeHtml,
  type ConversationItem,
  type MessagePage,
  type ComposerState,
  type PageNotice
} from '../../features/chat/contracts';
import { buildConversationListView, renderConversationList, type ConversationListView } from '../../features/chat/ConversationList';
import { buildChatHeaderView, renderChatHeader, type ChatHeaderView } from '../../features/chat/ChatHeader';
import {
  buildRealtimeStatusPlaceholderView,
  renderRealtimeStatusPlaceholder,
  type RealtimeStatusPlaceholderView
} from '../../features/chat/RealtimeStatusPlaceholder';
import { buildMessageListView, renderMessageList, type MessageListView } from '../../features/chat/MessageList';
import { buildMessageComposerView, renderMessageComposer, type MessageComposerView } from '../../features/chat/MessageComposer';

type ChatPageViewInput = {
  workspaceId: string;
  conversationItems?: ConversationItem[];
  activeConversationId?: string | null;
  isSwitchingConversation?: boolean;
  messagePage?: MessagePage;
  composerState?: ComposerState;
  realtimeState?: string;
  onConversationSelect?: (conversationId: string) => void;
  onComposerChange?: (draft: string) => void;
  onComposerSubmit?: (draft: string) => void;
  onComposerRetry?: (draft: string) => void;
};

export type ChatPageView = {
  workspaceId: string;
  activeConversationId: string | null;
  pageNotice: PageNotice;
  conversationList: ConversationListView;
  header: ChatHeaderView;
  realtime: RealtimeStatusPlaceholderView;
  messageList: MessageListView;
  composer: MessageComposerView;
};

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
}: ChatPageViewInput): ChatPageView => {
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

export const renderChatPage = (view: ChatPageView): string => `ChatPage:${escapeHtml(view.workspaceId ?? 'unknown')}
conversation=${escapeHtml(view.activeConversationId ?? 'none')}
page-notice=${escapeHtml(view.pageNotice.code)}
page-notice-tone=${escapeHtml(view.pageNotice.tone)}
page-notice-message=${escapeHtml(view.pageNotice.message)}
${renderChatHeader(view.header)}
${renderRealtimeStatusPlaceholder(view.realtime)}
${renderConversationList(view.conversationList)}
${renderMessageList(view.messageList)}
${renderMessageComposer(view.composer)}`;
