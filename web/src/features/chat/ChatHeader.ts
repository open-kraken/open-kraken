import { escapeHtml, type ConversationItem } from './contracts';

type ChatHeaderInput = {
  activeConversation: ConversationItem | null;
  isSwitchingConversation: boolean;
};

export type ChatHeaderView = {
  title: string;
  type: string;
  subtitle: string;
  statusLabel: string;
};

export const buildChatHeaderView = ({ activeConversation, isSwitchingConversation }: ChatHeaderInput): ChatHeaderView => ({
  title: activeConversation ? String(activeConversation.title ?? activeConversation.customName ?? activeConversation.id) : 'No conversation',
  type: activeConversation?.type ?? 'channel',
  subtitle: activeConversation?.subtitle ? String(activeConversation.subtitle) : '',
  statusLabel: isSwitchingConversation ? 'Switching' : 'Ready'
});

export const renderChatHeader = (view: ChatHeaderView): string => `<header class="chat-header" data-status="${escapeHtml(view.statusLabel.toLowerCase())}">
  <strong class="chat-header__title">${escapeHtml(view.title)}</strong>
  <span class="chat-header__type">${escapeHtml(view.type)}</span>
  <span class="chat-header__status">${escapeHtml(view.statusLabel)}</span>
</header>`;
