import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '@/app/layouts/AppShell';
import { createMockClient } from '@/mocks/mock-client';
import { AppShellContext, type AppShellContextValue } from '@/state/app-shell-store';
import { appRoutes, resolveAppRoute } from '@/routes';
import { AuthContext } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { shellTestAuthValue } from '@/test/shell-test-auth';

const createRouteApiClient = (): AppShellContextValue['apiClient'] => {
  const client = createMockClient({ workspaceId: 'ws_open_kraken' });
  return {
    ...client,
    getWorkspaceSummary: async () => ({ workspaceId: 'ws_open_kraken', membersOnline: 1, activeConversationId: 'conv_general' }),
    getRoadmapDocument: () => client.getRoadmap(),
    updateRoadmapDocument: (payload: { readOnly: boolean; roadmap: Record<string, unknown> }) =>
      client.updateRoadmap(payload.roadmap),
    getProjectDataDocument: () => client.getProjectData(),
    updateProjectDataDocument: (payload: { readOnly: boolean; payload: Record<string, unknown> }) =>
      client.updateProjectData(payload),
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

const renderShell = (routePath: string) => {
  const route = resolveAppRoute(routePath);
  const contextValue: AppShellContextValue = {
    route,
    routes: appRoutes,
    workspace: {
      workspaceId: 'ws_open_kraken',
      workspaceLabel: 'open-kraken Migration Workspace'
    },
    notifications: [
      {
        id: 'toast_one',
        tone: 'warning',
        title: 'Conflict detected',
        detail: 'Reload before retrying.'
      }
    ],
    realtime: {
      status: 'connected',
      detail: 'Connected to workspace stream',
      lastCursor: 'cursor_42'
    },
    apiClient: createRouteApiClient(),
    realtimeClient: {
      connect: () => undefined,
      disconnect: () => undefined,
      reconnect: () => undefined,
      subscribe: () => ({ subscriptionId: 'sub_test', unsubscribe: () => undefined }),
      getStatus: () => 'connected',
      getCursor: () => 'cursor_42',
      dispatch: () => undefined
    } as unknown as AppShellContextValue['realtimeClient'],
    navigate: () => undefined,
    pushNotification: () => undefined,
    dismissNotification: () => undefined,
    chatNotifications: { totalUnread: 0, items: [] },
    markAllChatRead: () => undefined,
    markChatConversationRead: () => undefined
  };

  return renderToStaticMarkup(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        I18nProvider,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: shellTestAuthValue },
          React.createElement(
            AppShellContext.Provider,
            { value: contextValue },
            React.createElement(AppShell)
          )
        )
      )
    )
  );
};

test('resolveAppRoute covers required shell paths', () => {
  assert.equal(resolveAppRoute('/chat').id, 'chat');
  assert.equal(resolveAppRoute('/members').id, 'members');
  assert.equal(resolveAppRoute('/skills').id, 'skills');
  assert.equal(resolveAppRoute('/taskmap').id, 'taskmap');
  assert.equal(resolveAppRoute('/roadmap').id, 'roadmap');
  assert.equal(resolveAppRoute('/terminal').id, 'terminal');
  assert.equal(resolveAppRoute('/approvals').id, 'approvals');
  assert.equal(resolveAppRoute('/workspaces').id, 'workspaces');
  assert.equal(resolveAppRoute('/repositories').id, 'repositories');
  assert.equal(resolveAppRoute('/namespaces').id, 'namespaces');
  assert.equal(resolveAppRoute('/artifacts').id, 'artifacts');
  assert.equal(resolveAppRoute('/settings').id, 'settings');
  assert.equal(resolveAppRoute('/system').id, 'system');
  assert.equal(resolveAppRoute('/ledger').id, 'ledger');
  assert.equal(resolveAppRoute('/account').id, 'account');
  assert.equal(resolveAppRoute('/missing').id, 'dashboard');
});

test('AppShell renders workspace shell chrome and the expanded prototype navigation', () => {
  const markup = renderShell('/members');

  assert.match(markup, /data-shell-slot="workspace"/);
  assert.match(markup, /data-shell-slot="latency"/);
  assert.match(markup, /data-shell-route="members"/);
  assert.match(markup, /data-nav-route="taskmap"/);
  assert.match(markup, /data-nav-route="approvals"/);
  assert.match(markup, /data-nav-route="workspaces"/);
  assert.match(markup, /data-nav-route="repositories"/);
  assert.match(markup, /data-nav-route="namespaces"/);
  assert.match(markup, /data-nav-route="artifacts"/);
  assert.match(markup, /Notices/);
});

test('chat and terminal routes mount under AppShell with shell layout intact', () => {
  const chatMarkup = renderShell('/chat');
  const terminalMarkup = renderShell('/terminal');

  assert.match(chatMarkup, /data-shell-route="chat"/);
  assert.match(chatMarkup, /data-nav-route="chat"/);
  assert.match(chatMarkup, /Workspace status/);

  assert.match(terminalMarkup, /data-shell-route="terminal"/);
  assert.match(terminalMarkup, /data-nav-route="terminal"/);
  assert.match(terminalMarkup, /Workspace status/);
});

test('roadmap route is wired through AppShell', () => {
  const markup = renderShell('/roadmap');

  assert.match(markup, /data-shell-route="roadmap"/);
  assert.match(markup, /data-nav-route="roadmap"/);
  assert.match(markup, /Notices/);
});

test('settings route is wired through AppShell', () => {
  const markup = renderShell('/settings');

  assert.match(markup, /data-shell-route="settings"/);
  assert.match(markup, /data-nav-route="settings"/);
});

test('system route is wired through AppShell', () => {
  const markup = renderShell('/system');

  assert.match(markup, /data-shell-route="system"/);
  assert.match(markup, /data-nav-route="system"/);
  assert.match(markup, /data-shell-slot="latency"/);
});
