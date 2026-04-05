import { escapeHtml } from './contracts.mjs';

export const buildChatHeaderView = ({ activeConversation, isSwitchingConversation }) => ({
  title: activeConversation ? String(activeConversation.title ?? activeConversation.customName ?? activeConversation.id) : 'No conversation',
  type: activeConversation?.type ?? 'channel',
  subtitle: activeConversation?.subtitle ? String(activeConversation.subtitle) : '',
  statusLabel: isSwitchingConversation ? 'Switching' : 'Ready'
});

export const renderChatHeader = (view) => `<header class="chat-header" data-status="${escapeHtml(view.statusLabel.toLowerCase())}">
  <strong class="chat-header__title">${escapeHtml(view.title)}</strong>
  <span class="chat-header__type">${escapeHtml(view.type)}</span>
  <span class="chat-header__status">${escapeHtml(view.statusLabel)}</span>
</header>`;
