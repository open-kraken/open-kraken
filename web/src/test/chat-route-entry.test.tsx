import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '@/app/layouts/AppShell';
import { ChatPage, buildChatPageRouteModel, loadChatRouteData } from '@/pages/chat/ChatPage';
import { AppShellContext, type AppShellContextValue } from '@/state/app-shell-store';
import { appRoutes, resolveAppRoute } from '@/routes';
import { TestI18n } from '@/test/i18n-test-utils';

const testApiClient: AppShellContextValue['apiClient'] = {
  getWorkspaceSummary: async () => ({ workspaceId: 'ws_open_kraken', membersOnline: 1, activeConversationId: 'conv_general' }),
  getConversations: async () => ({
    workspace: { id: 'ws_open_kraken' },
    conversations: [
      {
        id: 'conv_general',
        type: 'channel',
        customName: 'General',
        lastMessagePreview: 'Terminal session attached.',
        unreadCount: 1,
        isDefault: true
      }
    ]
  }),
  getMessages: async () => ({
    items: [
      {
        id: 'msg_1',
        senderId: 'owner_1',
        content: { type: 'text', text: 'open-kraken mock baseline is ready.' },
        status: 'sent'
      }
    ],
    nextBeforeId: null
  }),
  sendMessage: async () => ({}),
  getMembers: async () => ({ members: [] }),
  getRoadmap: async () => ({ readOnly: false, storage: 'workspace', warning: '', roadmap: { objective: 'Ship', tasks: [] } }),
  getRoadmapDocument: async () => ({ readOnly: false, storage: 'workspace', warning: '', roadmap: { objective: 'Ship', tasks: [] } }),
  updateRoadmapDocument: async (payload) => ({ readOnly: false, storage: 'workspace', warning: '', roadmap: payload.roadmap }),
  getProjectDataDocument: async () => ({ readOnly: false, storage: 'workspace', warning: '', payload: {} }),
  updateProjectDataDocument: async (payload) => ({ readOnly: false, storage: 'workspace', warning: '', payload: payload.payload }),
  attachTerminalSession: async () => ({})
};

const testRealtimeClient = {
  connect: () => undefined,
  disconnect: () => undefined,
  reconnect: () => undefined,
  subscribe: () => ({ subscriptionId: 'sub_test', unsubscribe: () => undefined }),
  getStatus: () => 'connected',
  getCursor: () => 'cursor_42',
  dispatch: () => undefined
} as unknown as AppShellContextValue['realtimeClient'];

const createShellContext = (
  routePath: string,
  realtimeStatus: AppShellContextValue['realtime']['status'],
  realtimeDetail: string
): AppShellContextValue => ({
  route: resolveAppRoute(routePath),
  routes: appRoutes,
  workspace: {
    workspaceId: 'ws_open_kraken',
    workspaceLabel: 'open-kraken Migration Workspace'
  },
  notifications: [],
  realtime: {
    status: realtimeStatus,
    detail: realtimeDetail,
    lastCursor: null
  },
  apiClient: testApiClient,
  realtimeClient: testRealtimeClient,
  navigate: () => undefined,
  pushNotification: () => undefined,
  dismissNotification: () => undefined
});

test('chat route model keeps a single page-level notice precedence across switching, composer failure, and realtime degradation', () => {
  const switching = buildChatPageRouteModel({
    workspaceId: 'ws_open_kraken',
    realtimeStatus: 'disconnected',
    realtimeDetail: 'Realtime disconnected',
    conversationItems: [{ id: 'conv_general', type: 'channel', customName: 'General' }],
    messagePage: { items: [], nextBeforeId: null },
    composerStatus: 'failed',
    composerErrorMessage: 'Message delivery failed.',
    isSwitchingConversation: true
  });
  const failed = buildChatPageRouteModel({
    workspaceId: 'ws_open_kraken',
    realtimeStatus: 'disconnected',
    realtimeDetail: 'Realtime disconnected',
    conversationItems: [{ id: 'conv_general', type: 'channel', customName: 'General' }],
    messagePage: { items: [], nextBeforeId: null },
    composerStatus: 'failed',
    composerErrorMessage: 'Message delivery failed.'
  });
  const degraded = buildChatPageRouteModel({
    workspaceId: 'ws_open_kraken',
    realtimeStatus: 'disconnected',
    realtimeDetail: 'Realtime disconnected',
    conversationItems: [{ id: 'conv_general', type: 'channel', customName: 'General' }],
    messagePage: { items: [], nextBeforeId: null }
  });

  assert.equal(switching.pageNotice.code, 'switching');
  assert.equal(failed.pageNotice.code, 'composer-failed');
  assert.equal(degraded.pageNotice.code, 'degraded');
});

test('chat route loader pulls conversation items and message page from the formal api client boundary', async () => {
  const data = await loadChatRouteData(testApiClient);

  assert.equal(data.conversationItems[0]?.id, 'conv_general');
  assert.equal(data.messagePage.items[0]?.id, 'msg_1');
});

test('AppShell renders the chat route with shell realtime state mapped into the page-level chat notice', () => {
  const markup = renderToStaticMarkup(
    <AppShellContext.Provider value={createShellContext('/chat', 'disconnected', 'Realtime disconnected')}>
      <TestI18n>
        <AppShell />
      </TestI18n>
    </AppShellContext.Provider>
  );

  assert.match(markup, /data-route-page="chat"/);
  assert.match(markup, /data-page-notice="degraded"/);
  assert.match(markup, /Realtime is degraded\. Browsing stays available, but sending is temporarily unavailable\./);
  assert.match(markup, /data-chat-slot="messages"/);
  assert.match(markup, /Loaded conversations: 1 \| Loaded messages: 1/);
});

test('ChatPage component can surface composer failure at the real page entry without conflicting child status copy', () => {
  const markup = renderToStaticMarkup(
    <AppShellContext.Provider value={createShellContext('/chat', 'connected', 'Connected to workspace stream')}>
      <TestI18n>
        <ChatPage feedbackOverride={{ composerStatus: 'failed', composerErrorMessage: 'Message delivery failed.' }} />
      </TestI18n>
    </AppShellContext.Provider>
  );

  assert.match(markup, /data-page-notice="composer-failed"/);
  assert.match(markup, /Message delivery failed\./);
  assert.doesNotMatch(markup, /Realtime is degraded|Switching conversations/);
});
