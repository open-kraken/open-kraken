import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthContext } from '@/auth/AuthProvider';
import { createMockClient } from '@/mocks/mock-client';
import { AppShellContext, type AppShellContextValue } from '@/state/app-shell-store';
import { appRoutes, resolveAppRoute, type AppRouteId } from '@/routes';
import { TestI18n } from '@/test/i18n-test-utils';
import { shellTestAuthValue } from '@/test/shell-test-auth';

const createRouteApiClient = (): AppShellContextValue['apiClient'] => {
  const client = createMockClient({ workspaceId: 'ws_open_kraken' });
  return {
    ...client,
    getWorkspaceSummary: async () => ({ workspaceId: 'ws_open_kraken', membersOnline: 1, activeConversationId: 'conv_general' }),
    getRoadmapDocument: async () => ({
      readOnly: false,
      storage: 'workspace',
      warning: '',
      roadmap: {
        objective: 'Ship',
        tasks: [{ id: 'task_1', number: 1, title: 'Freeze DTOs', status: 'done', pinned: true }]
      }
    }),
    updateRoadmapDocument: async (payload: { readOnly: boolean; roadmap: Record<string, unknown> }) => ({
      readOnly: false,
      storage: 'workspace',
      warning: '',
      roadmap: payload.roadmap
    }),
    getProjectDataDocument: async () => ({
      readOnly: false,
      storage: 'workspace',
      warning: '',
      payload: { projectName: 'open-kraken', owner: 'Claire' }
    }),
    updateProjectDataDocument: async (payload: { readOnly: boolean; payload: Record<string, unknown> }) => ({
      readOnly: false,
      storage: 'workspace',
      warning: '',
      payload: payload.payload
    }),
    attachTerminalSession: async () => ({}),
    createConversation: async (body: { type: 'direct' | 'team'; memberId?: string; teamId?: string }) => ({
      conversation: {
        id: body.type === 'direct' && body.memberId ? `conv_dm_${body.memberId}` : 'conv_new',
        type: body.type,
        teamId: body.teamId ?? null
      }
    }),
    createMember: async () => ({ members: [] }),
    updateMember: async () => ({ members: [] }),
    deleteMember: async () => ({ members: [] }),
    createTeam: async () => ({ members: [] }),
    updateTeam: async () => ({ members: [] }),
    deleteTeam: async () => ({ members: [] })
  } as unknown as AppShellContextValue['apiClient'];
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

const renderShellRoute = (routeId: AppRouteId) => {
  const route = appRoutes.find((item) => item.id === routeId) ?? resolveAppRoute('/chat');
  const contextValue: AppShellContextValue = {
    route,
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
    apiClient: createRouteApiClient(),
    realtimeClient: testRealtimeClient,
    navigate: () => undefined,
    pushNotification: () => undefined,
    dismissNotification: () => undefined,
    chatNotifications: { totalUnread: 0, items: [] },
    markAllChatRead: () => undefined,
    markChatConversationRead: () => undefined
  };

  return renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: shellTestAuthValue },
      React.createElement(
        AppShellContext.Provider,
        { value: contextValue },
        React.createElement(TestI18n, null, React.createElement(AppShell))
      )
    )
  );
};

test('migration web gate: chat page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('chat');

  assert.match(markup, /data-shell-route="chat"/);
  assert.match(markup, /data-nav-route="chat"/);
  assert.match(markup, /Workspace status/);
});

test('migration web gate: members page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('members');

  assert.match(markup, /data-shell-route="members"/);
  assert.match(markup, /data-nav-route="members"/);
  assert.match(markup, /data-nav-route="skills"/);
});

test('migration web gate: roadmap page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('roadmap');

  assert.match(markup, /data-shell-route="roadmap"/);
  assert.match(markup, /data-nav-route="taskmap"/);
  assert.match(markup, /Workspace status/);
});

test('migration web gate: terminal page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('terminal');

  assert.match(markup, /data-shell-route="terminal"/);
  assert.match(markup, /data-nav-route="terminal"/);
  assert.match(markup, /Workspace status/);
});

test('migration web gate: settings page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('settings');

  assert.match(markup, /data-shell-route="settings"/);
  assert.match(markup, /data-nav-route="settings"/);
});

test('migration web gate: system page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('system');

  assert.match(markup, /data-shell-route="system"/);
  assert.match(markup, /data-nav-route="system"/);
  assert.match(markup, /data-shell-slot="latency"/);
});

test('migration web gate: ledger page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('ledger');

  assert.match(markup, /data-shell-route="ledger"/);
  assert.match(markup, /data-nav-route="ledger"/);
});

test('migration web gate: skills page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('skills');

  assert.match(markup, /data-shell-route="skills"/);
  assert.match(markup, /data-nav-route="skills"/);
});
