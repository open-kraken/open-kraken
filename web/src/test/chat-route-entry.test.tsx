import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  createConversation: async (body: { type: 'direct' | 'team'; memberId?: string; teamId?: string }) => ({
    conversation: {
      id: body.type === 'direct' && body.memberId ? `conv_dm_${body.memberId}` : 'conv_new',
      type: body.type,
      memberIds: body.memberId ? [body.memberId] : undefined,
      teamId: body.teamId ?? null
    }
  }),
  getMembers: async () => ({ members: [] }),
  createMember: async () => ({ members: [] }),
  updateMember: async () => ({ members: [] }),
  deleteMember: async () => ({ members: [] }),
  createTeam: async () => ({ members: [] }),
  updateTeam: async () => ({ members: [] }),
  deleteTeam: async () => ({ members: [] }),
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
  dismissNotification: () => undefined,
  chatNotifications: { totalUnread: 0, items: [] },
  markAllChatRead: () => undefined,
  markChatConversationRead: () => undefined
});

test('chat route model keeps blocking notices above non-blocking realtime degradation', () => {
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
  assert.equal(degraded.pageNotice.code, 'live');
  assert.equal(degraded.composer.disabled, false);
});

test('chat route loader pulls conversation items and message page from the formal api client boundary', async () => {
  const data = await loadChatRouteData(testApiClient);

  assert.equal(data.conversationItems[0]?.id, 'conv_general');
  assert.equal(data.messagePage.items[0]?.id, 'msg_1');
});

test('Chat page keeps degraded realtime out of the blocking page notice', () => {
  /** Render `ChatPage` directly: `AppShell` uses `lazy()` for routes, which `renderToStaticMarkup` does not resolve. */
  const markup = renderToStaticMarkup(
    <AppShellContext.Provider value={createShellContext('/chat', 'disconnected', 'Realtime disconnected')}>
      <TestI18n>
        <ChatPage />
      </TestI18n>
    </AppShellContext.Provider>
  );

  assert.match(markup, /data-route-page="chat"/);
  assert.match(markup, /data-page-notice="live"/);
  assert.doesNotMatch(markup, /Realtime is degraded|sending is temporarily unavailable|暂时无法发送/);
  assert.match(markup, /data-chat-slot="messages"/);
  /** Static render runs before `useEffect`; counts stay at zero until data loads in the browser. */
  assert.match(markup, /Loaded conversations: 0 \| Loaded messages: 0/);
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
