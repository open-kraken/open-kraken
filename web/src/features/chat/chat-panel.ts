import { buildChatPageView, renderChatPage, type ChatPageView } from '../../pages/chat/chat-page-view';

type Conversation = {
  id: string;
  type?: string;
  customName?: string;
  unreadCount?: number;
  isDefault?: boolean;
  lastMessagePreview?: string;
};

type Message = {
  id: string;
  senderId?: string;
  content?: { text?: string };
  status?: string;
};

const toConversationItem = (conversation: Conversation) => ({
  id: conversation.id,
  type: conversation.type,
  title: conversation.customName ?? conversation.id,
  unreadCount: conversation.unreadCount ?? 0,
  isDefault: Boolean(conversation.isDefault),
  lastMessagePreview: conversation.lastMessagePreview ?? ''
});

const toMessageItem = (message: Message) => ({
  id: message.id,
  senderId: message.senderId,
  senderName: message.senderId ?? 'Unknown sender',
  content: message.content?.text ?? '',
  status: message.status
});

type ChatPanelInput = {
  workspaceId?: string;
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
};

export const buildChatPanelView = ({ workspaceId = 'ws_open_kraken', conversations, messagesByConversation }: ChatPanelInput): ChatPageView => {
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

export const renderChatPanel = (view: ChatPageView): string => renderChatPage(view);
