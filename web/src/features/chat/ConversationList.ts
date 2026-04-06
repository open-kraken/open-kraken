import { escapeHtml, type ConversationItem } from './contracts';

type ConversationListInput = {
  conversationItems: ConversationItem[];
  activeConversationId: string | null;
  isSwitchingConversation: boolean;
  onConversationSelect?: (conversationId: string) => void;
};

type ConversationListItemView = {
  id: string;
  title: string;
  preview: string;
  unreadCount: number;
  isSelected: boolean;
  disabled: boolean;
};

export type ConversationListView = {
  items: ConversationListItemView[];
  onSelect: (conversationId: string) => void;
};

export const buildConversationListView = ({
  conversationItems,
  activeConversationId,
  isSwitchingConversation,
  onConversationSelect = () => {}
}: ConversationListInput): ConversationListView => ({
  items: conversationItems.map((conversation) => ({
    id: conversation.id,
    title: String(conversation.title ?? conversation.customName ?? conversation.id),
    preview: conversation.lastMessagePreview ? String(conversation.lastMessagePreview) : '',
    unreadCount: Number(conversation.unreadCount ?? 0),
    isSelected: conversation.id === activeConversationId,
    disabled: Boolean(isSwitchingConversation)
  })),
  onSelect: (conversationId: string) => {
    if (isSwitchingConversation) {
      return;
    }
    onConversationSelect(conversationId);
  }
});

export const renderConversationList = (view: ConversationListView): string => {
  const items = view.items
    .map(
      (conversation) => `<button class="chat-conversation-item${conversation.isSelected ? ' is-selected' : ''}" data-conversation-id="${escapeHtml(conversation.id)}" data-selected="${String(conversation.isSelected)}" data-disabled="${String(conversation.disabled)}">
  <span class="chat-conversation-item__title">${escapeHtml(conversation.title)}</span>
  <span class="chat-conversation-item__preview">${escapeHtml(conversation.preview)}</span>
  <span class="chat-conversation-item__unread">${conversation.unreadCount}</span>
</button>`
    )
    .join('\n');
  return `conversation-list-count=${view.items.length}
<aside class="chat-conversation-list">
${items}
</aside>`;
};
