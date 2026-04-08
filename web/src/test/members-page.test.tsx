import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MembersPage } from '@/pages/members/MembersPage';
import { AuthContext } from '@/auth/AuthProvider';
import { AppShellContext, type AppShellContextValue } from '@/state/app-shell-store';
import { appRoutes, resolveAppRoute } from '@/routes';
import { TestI18n } from '@/test/i18n-test-utils';
import { shellTestAuthValue } from '@/test/shell-test-auth';

const emptyRoster = async () => ({ members: [] });

const testApiClient: AppShellContextValue['apiClient'] = {
  getWorkspaceSummary: async () => ({ workspaceId: 'ws_open_kraken', membersOnline: 3, activeConversationId: 'conv_general' }),
  getConversations: async () => ({ workspace: { id: 'ws_open_kraken' }, conversations: [] }),
  getMessages: async () => ({ items: [], nextBeforeId: null }),
  sendMessage: async () => ({}),
  createConversation: async (body: { type: 'direct' | 'team'; memberId?: string; teamId?: string }) => ({
    conversation: {
      id: body.type === 'direct' && body.memberId ? `conv_dm_${body.memberId}` : 'conv_new',
      type: body.type,
      teamId: body.teamId ?? null
    }
  }),
  getMembers: async () => ({ members: [] }),
  createMember: emptyRoster,
  updateMember: async () => ({ members: [] }),
  deleteMember: emptyRoster,
  createTeam: emptyRoster,
  updateTeam: async () => ({ members: [] }),
  deleteTeam: emptyRoster,
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

const renderMembersPage = (realtimeStatus: AppShellContextValue['realtime']['status'] = 'connected') => {
  const route = resolveAppRoute('/members');
  const contextValue: AppShellContextValue = {
    route,
    routes: appRoutes,
    workspace: {
      workspaceId: 'ws_open_kraken',
      workspaceLabel: 'open-kraken Migration Workspace'
    },
    notifications: [],
    realtime: {
      status: realtimeStatus,
      detail: 'Connected to workspace stream',
      lastCursor: 'cursor_42'
    },
    apiClient: testApiClient,
    realtimeClient: testRealtimeClient,
    navigate: () => undefined,
    pushNotification: () => undefined,
    dismissNotification: () => undefined,
    chatNotifications: { totalUnread: 0, items: [] },
    markAllChatRead: () => undefined,
    markChatConversationRead: () => undefined
  };

  return renderToStaticMarkup(
    <AuthContext.Provider value={shellTestAuthValue}>
      <AppShellContext.Provider value={contextValue}>
        <TestI18n>
          <MembersPage />
        </TestI18n>
      </AppShellContext.Provider>
    </AuthContext.Provider>
  );
};

test('members page renders formal route content with role, status, and active task lanes', () => {
  const markup = renderMembersPage();

  assert.match(markup, /data-page-entry="members-runtime"/);
  assert.match(markup, /data-route-page="members"/);
  assert.match(markup, /data-realtime-status="idle"/);
  assert.match(markup, /route-page__grid route-page__grid--members-workbench/);
  assert.match(markup, /members-page__context-bar/);
  assert.match(markup, /members-workbench-list/);
  assert.match(markup, /members-roster-admin/);
});

test('members page keeps shell realtime status in the shared page entry', () => {
  const markup = renderMembersPage('reconnecting');

  assert.match(markup, /Shell realtime/);
  assert.match(markup, /data-realtime-status="idle"/);
  assert.match(markup, /members-workbench-list/);
  assert.match(markup, /Skills · Node · Process · CLI/);
  assert.match(markup, /Live workspace/);
});
