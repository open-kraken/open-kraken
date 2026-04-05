import { buildChatPageView, renderChatPage } from '../../pages/chat/chat-page-view.mjs';

const toConversationItem = (conversation) => ({
  id: conversation.id,
  type: conversation.type,
  title: conversation.customName ?? conversation.id,
  unreadCount: conversation.unreadCount ?? 0,
  isDefault: Boolean(conversation.isDefault),
  lastMessagePreview: conversation.lastMessagePreview ?? ''
});

const toMessageItem = (message) => ({
  id: message.id,
  senderId: message.senderId,
  senderName: message.senderId ?? 'Unknown sender',
  content: message.content?.text ?? '',
  status: message.status
});

export const buildChatPanelView = ({ workspaceId = 'ws_open_kraken', conversations, messagesByConversation }) => {
  const activeConversation = conversations.find((conversation) => conversation.isDefault) ?? conversations[0] ?? null;
  return buildChatPageView({
    workspaceId,
    conversationItems: conversations.map(toConversationItem),
    activeConversationId: activeConversation?.id ?? null,
    isSwitchingConversation: false,
    messagePage: {
      items: activeConversation ? (messagesByConversation[activeConversation.id] ?? []).map(toMessageItem) : []
    },
    composerState: {
      draft: '',
      status: 'idle'
    },
    realtimeState: 'live'
  });
};

export const renderChatPanel = (view) => renderChatPage(view);
