import { escapeHtml, type ConversationItem } from './contracts';

type MessagePageNormalized = {
  items: Array<{ id: string; senderName?: string; senderId?: string; content?: string; text?: string; status?: string }>;
  error: string | null;
  hasOlderMessages: boolean;
  isLoadingOlder: boolean;
};

type MessageListInput = {
  activeConversation: ConversationItem | null;
  messagePage: MessagePageNormalized;
};

type MessageListItemView = {
  id: string;
  senderName: string;
  content: string;
  status: string;
};

export type MessageListView = {
  state: string;
  items: MessageListItemView[];
  errorMessage: string | null;
  hasOlderMessages: boolean;
  isLoadingOlder: boolean;
};

export const buildMessageListView = ({ activeConversation, messagePage }: MessageListInput): MessageListView => {
  let state = 'ready';
  if (!activeConversation) {
    state = 'empty-conversations';
  } else if (messagePage.error) {
    state = 'error';
  } else if (messagePage.items.length === 0) {
    state = 'empty-messages';
  }

  return {
    state,
    items: messagePage.items.map((message) => ({
      id: message.id,
      senderName: String(message.senderName ?? message.senderId ?? 'Unknown sender'),
      content: String(message.content ?? message.text ?? ''),
      status: String(message.status ?? 'sent')
    })),
    errorMessage: messagePage.error,
    hasOlderMessages: messagePage.hasOlderMessages,
    isLoadingOlder: messagePage.isLoadingOlder
  };
};

export const renderMessageList = (view: MessageListView): string => {
  if (view.state === 'empty-conversations') {
    return `message-list-state=empty-conversations
<section class="chat-message-list chat-message-list--empty">No conversations available yet.</section>`;
  }
  if (view.state === 'error') {
    return `message-list-state=error
<section class="chat-message-list chat-message-list--error">${escapeHtml(view.errorMessage)}</section>`;
  }
  if (view.state === 'empty-messages') {
    return `message-list-state=empty-messages
<section class="chat-message-list chat-message-list--empty">No messages in this conversation yet.</section>`;
  }
  const items = view.items
    .map(
      (message) => `<article class="chat-message" data-message-id="${escapeHtml(message.id)}" data-message-status="${escapeHtml(message.status)}">
  <span class="chat-message__sender">${escapeHtml(message.senderName)}</span>
  <p class="chat-message__content">${escapeHtml(message.content)}</p>
</article>`
    )
    .join('\n');
  return `message-list-state=ready
message-list-has-older=${String(view.hasOlderMessages)}
message-list-loading-older=${String(view.isLoadingOlder)}
<section class="chat-message-list">
${items}
</section>`;
};
