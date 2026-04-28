import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatPageView, renderChatPage } from '../pages/chat/chat-page-view.ts';

const baseConversations = [
  {
    id: 'conv_general',
    type: 'channel',
    title: 'General',
    lastMessagePreview: 'Latest update',
    unreadCount: 1,
    isDefault: true
  },
  {
    id: 'conv_ops',
    type: 'channel',
    title: 'Ops',
    lastMessagePreview: 'Deploy ready',
    unreadCount: 0
  }
];

const baseMessages = [
  {
    id: 'msg_1',
    senderId: 'owner_1',
    senderName: 'Claire',
    content: 'open-kraken mock baseline is ready.',
    status: 'sent'
  }
];

test('chat page keeps empty conversation state explicit and disables composer', () => {
  const view = buildChatPageView({
    workspaceId: 'ws_open_kraken',
    conversationItems: [],
    activeConversationId: null,
    messagePage: { items: [] },
    composerState: { draft: '', status: 'idle' },
    realtimeState: 'live'
  });
  const rendered = renderChatPage(view);

  assert.equal(view.activeConversationId, null);
  assert.equal(view.messageList.state, 'empty-conversations');
  assert.equal(view.composer.disabled, true);
  assert.equal(view.composer.disabledReason, 'no-conversation');
  assert.match(rendered, /message-list-state=empty-conversations/);
});

test('chat page blocks repeated conversation switching and promotes a single page-level switching notice', () => {
  const seen = [];
  const view = buildChatPageView({
    workspaceId: 'ws_open_kraken',
    conversationItems: baseConversations,
    activeConversationId: 'conv_general',
    isSwitchingConversation: true,
    messagePage: { items: baseMessages },
    composerState: { draft: 'queued text', status: 'idle' },
    realtimeState: 'live',
    onConversationSelect: (conversationId) => seen.push(conversationId)
  });
  const rendered = renderChatPage(view);

  view.conversationList.onSelect('conv_ops');

  assert.deepEqual(seen, []);
  assert.equal(view.pageNotice.code, 'switching');
  assert.equal(view.composer.disabledReason, 'switching');
  assert.match(rendered, /page-notice=switching/);
  assert.doesNotMatch(rendered, /Reconnecting|Degraded/);
});

test('chat page keeps realtime degraded non-blocking while leaving message history readable', () => {
  const view = buildChatPageView({
    workspaceId: 'ws_open_kraken',
    conversationItems: baseConversations,
    activeConversationId: 'conv_general',
    messagePage: { items: baseMessages },
    composerState: { draft: 'hello', status: 'idle' },
    realtimeState: 'degraded'
  });
  const rendered = renderChatPage(view);

  assert.equal(view.pageNotice.code, 'live');
  assert.equal(view.messageList.state, 'ready');
  assert.equal(view.composer.disabled, false);
  assert.equal(view.composer.disabledReason, null);
  assert.match(rendered, /data-realtime-state="degraded"/);
  assert.match(rendered, /page-notice=live/);
  assert.match(rendered, /message-list-state=ready/);
});

test('chat page surfaces composer failures through unified page notice and retry callback', () => {
  const retries = [];
  const submits = [];
  const view = buildChatPageView({
    workspaceId: 'ws_open_kraken',
    conversationItems: baseConversations,
    activeConversationId: 'conv_general',
    messagePage: { items: [] },
    composerState: {
      draft: 'retry me',
      status: 'failed',
      errorMessage: 'Message delivery failed. Retry after connection recovery.'
    },
    realtimeState: 'live',
    onComposerSubmit: (draft) => submits.push(draft),
    onComposerRetry: (draft) => retries.push(draft)
  });
  const rendered = renderChatPage(view);

  view.composer.onSubmit();
  view.composer.onRetry();

  assert.deepEqual(submits, ['retry me']);
  assert.deepEqual(retries, ['retry me']);
  assert.equal(view.pageNotice.code, 'composer-failed');
  assert.equal(view.composer.canRetry, true);
  assert.match(rendered, /page-notice=composer-failed/);
  assert.match(rendered, /data-can-retry="true"/);
});
