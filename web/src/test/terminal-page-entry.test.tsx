import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalPage } from '@/pages/terminal/TerminalPage';
import { AppShellContext, type AppShellContextValue } from '@/state/app-shell-store';
import { appRoutes, resolveAppRoute } from '@/routes';
import { TestI18n } from '@/test/i18n-test-utils';

const terminalApiClient = {
  getWorkspaceSummary: async () => ({ workspaceId: 'ws_open_kraken', membersOnline: 1, activeConversationId: 'conv_general' }),
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
  createMember: async () => ({ members: [] }),
  updateMember: async () => ({ members: [] }),
  deleteMember: async () => ({ members: [] }),
  createTeam: async () => ({ members: [] }),
  updateTeam: async () => ({ members: [] }),
  deleteTeam: async () => ({ members: [] }),
  getRoadmap: async () => ({ readOnly: false, storage: 'workspace', warning: '', roadmap: { objective: 'Ship', tasks: [] } }),
  getRoadmapDocument: async () => ({ readOnly: false, storage: 'workspace', warning: '', roadmap: { objective: 'Ship', tasks: [] } }),
  updateRoadmapDocument: async (payload: { readOnly: boolean; expectedVersion?: number; roadmap: { objective?: string; tasks?: unknown[] } }) => ({ readOnly: payload.readOnly, version: (payload.expectedVersion ?? 0) + 1, storage: 'workspace', warning: '', roadmap: payload.roadmap }),
  getProjectDataDocument: async () => ({ readOnly: false, storage: 'workspace', warning: '', payload: {} }),
  updateProjectDataDocument: async (payload: { readOnly: boolean; expectedVersion?: number; payload: Record<string, unknown> }) => ({ readOnly: payload.readOnly, version: (payload.expectedVersion ?? 0) + 1, storage: 'workspace', warning: '', payload: payload.payload }),
  attachTerminalSession: async () => ({}),
  attachTerminal: async () => ({
    session: {
      terminalId: 'term_owner_1',
      memberId: 'owner_1',
      workspaceId: 'ws_open_kraken',
      terminalType: 'codex',
      command: 'npm run verify:migration',
      status: 'attached'
    },
    snapshot: {
      terminalId: 'term_owner_1',
      seq: 1,
      buffer: {
        data: '$ attach\n'
      }
    }
  }),
  subscribe: () => () => undefined
} as unknown as AppShellContextValue['apiClient'];

const terminalRealtimeClient = {
  connect: () => undefined,
  disconnect: () => undefined,
  reconnect: () => undefined,
  subscribe: () => ({ subscriptionId: 'sub_test', unsubscribe: () => undefined }),
  getStatus: () => 'connected',
  getCursor: () => 'cursor_42',
  dispatch: () => undefined
} as unknown as AppShellContextValue['realtimeClient'];

test('terminal page renders the real panel container inside the route entry', () => {
  const contextValue: AppShellContextValue = {
    route: appRoutes.find((route) => route.id === 'terminal') ?? resolveAppRoute('/terminal'),
    routes: appRoutes,
    workspace: {
      workspaceId: 'ws_open_kraken',
      workspaceLabel: 'open-kraken Migration Workspace'
    },
    notifications: [],
    realtime: {
      status: 'connected',
      detail: 'Connected to workspace stream',
      lastCursor: 'cursor_42'
    },
    apiClient: terminalApiClient,
    realtimeClient: terminalRealtimeClient,
    navigate: () => undefined,
    pushNotification: () => undefined,
    dismissNotification: () => undefined,
    chatNotifications: { totalUnread: 0, items: [] },
    markAllChatRead: () => undefined,
    markChatConversationRead: () => undefined
  };

  const markup = renderToStaticMarkup(
    <AppShellContext.Provider value={contextValue}>
      <TestI18n>
        <TerminalPage />
      </TestI18n>
    </AppShellContext.Provider>
  );

  assert.match(markup, /data-route-page="terminal"/);
  assert.match(markup, /data-terminal-runtime="connected-panel"/);
  assert.match(markup, /aria-label="terminal-panel"/);
  assert.match(markup, /Attach Session/);
  assert.match(markup, /No active terminal session/);
});
