import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '@/app/layouts/AppShell';
import { createMockClient } from '@/mocks/mock-client.mjs';
import { AppShellContext, type AppShellContextValue } from '@/state/app-shell-store';
import { appRoutes, resolveAppRoute } from '@/routes';

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
    attachTerminalSession: async () => ({})
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
    dismissNotification: () => undefined
  };

  return renderToStaticMarkup(
    React.createElement(
      AppShellContext.Provider,
      { value: contextValue },
      React.createElement(AppShell)
    )
  );
};

test('resolveAppRoute covers required shell paths', () => {
  assert.equal(resolveAppRoute('/chat').id, 'chat');
  assert.equal(resolveAppRoute('/members').id, 'members');
  assert.equal(resolveAppRoute('/roadmap').id, 'roadmap');
  assert.equal(resolveAppRoute('/terminal').id, 'terminal');
  assert.equal(resolveAppRoute('/settings').id, 'settings');
  assert.equal(resolveAppRoute('/system').id, 'system');
  assert.equal(resolveAppRoute('/missing').id, 'chat');
});

test('AppShell exposes a single workspace, realtime, and notice outlet to pages', () => {
  const markup = renderShell('/members');

  assert.match(markup, /data-shell-slot="workspace"/);
  assert.match(markup, /data-shell-slot="realtime"/);
  assert.match(markup, /data-shell-slot="errors"/);
  assert.match(markup, /data-route-page="members"/);
  assert.match(markup, /route-page__grid route-page__grid--members/);
  assert.match(markup, /Member coordination surface/);
  assert.match(markup, /Active task/);
  assert.match(markup, /data-role="owner"/);
  assert.match(markup, /Global notices/);
});

test('chat and terminal routes render their current page-level shells inside AppShell', () => {
  const chatMarkup = renderShell('/chat');
  const terminalMarkup = renderShell('/terminal');

  assert.match(chatMarkup, /data-route-page="chat"/);
  assert.match(chatMarkup, /data-page-notice="live"/);
  assert.match(chatMarkup, /data-chat-slot="conversations"/);
  assert.match(chatMarkup, /data-chat-slot="messages"/);
  assert.match(chatMarkup, /data-chat-slot="composer"/);
  assert.match(chatMarkup, /Loaded conversations: 1 \| Loaded messages: 1/);

  assert.match(terminalMarkup, /data-route-page="terminal"/);
  assert.match(terminalMarkup, /route-page__grid route-page__grid--terminal/);
  assert.match(terminalMarkup, /Recovery chain/);
  assert.match(terminalMarkup, /Replay-safe buffer/);
  assert.match(terminalMarkup, /Connected to workspace stream/);
  assert.match(terminalMarkup, /terminal\.attach/);
  assert.match(terminalMarkup, /terminal\.snapshot/);
  assert.match(terminalMarkup, /terminal\.delta/);
  assert.match(terminalMarkup, /terminal\.status/);
  assert.match(terminalMarkup, /Snapshot is authoritative and replaces the rendered buffer/i);
});

test('roadmap route renders the formal page entry and keeps page errors subordinate to the shell notice outlet', () => {
  const markup = renderShell('/roadmap');

  assert.match(markup, /data-route-page="roadmap"/);
  assert.match(markup, /data-page-entry="roadmap-runtime"/);
  assert.match(markup, /Global notices/);
  assert.match(markup, /formal <code>\/roadmap<\/code> entry inside AppShell navigation/);
  assert.match(markup, /Unsaved local edits|Ready/);
  assert.match(markup, /Save roadmap/);
  assert.match(markup, /Save project data/);
});

test('settings route renders through the shell-owned workspace and notice entrypoints', () => {
  const markup = renderShell('/settings');

  assert.match(markup, /data-route-page="settings"/);
  assert.match(markup, /data-page-entry="settings-runtime"/);
  assert.match(markup, /Single global error outlet/);
  assert.match(markup, /Registered app surfaces/);
  assert.match(markup, /Emit shell notice/);
  assert.match(markup, /\/settings/);
});

test('system route renders observability baseline inside AppShell', () => {
  const markup = renderShell('/system');

  assert.match(markup, /data-route-page="system"/);
  assert.match(markup, /data-page-entry="system-runtime"/);
  assert.match(markup, /Observability, health, and control-plane signals/);
  assert.match(markup, /GET \/healthz/);
  assert.match(markup, /data-shell-slot="health"/);
});
