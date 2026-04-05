import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '@/app/layouts/AppShell';
import { createMockClient } from '@/mocks/mock-client.mjs';
import { AppShellContext, type AppShellContextValue } from '@/state/app-shell-store';
import { appRoutes, resolveAppRoute, type AppRouteId } from '@/routes';

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
    attachTerminalSession: async () => ({})
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

test('migration web gate: chat page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('chat');

  assert.match(markup, /data-shell-route="chat"/);
  assert.match(markup, /data-route-page="chat"/);
  assert.match(markup, /Conversation workspace for ws_open_kraken/);
  assert.match(markup, /Realtime detail: Connected to workspace stream/);
  assert.match(markup, /Loaded conversations: 1 \| Loaded messages: 1/);
});

test('migration web gate: members page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('members');

  assert.match(markup, /data-shell-route="members"/);
  assert.match(markup, /data-route-page="members"/);
  assert.match(markup, /Member coordination surface/);
  assert.match(markup, /Roster shows roles/);
  assert.match(markup, /View execution/);
});

test('migration web gate: roadmap page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('roadmap');

  assert.match(markup, /data-shell-route="roadmap"/);
  assert.match(markup, /data-route-page="roadmap"/);
  assert.match(markup, /Roadmap and project data stream/);
  assert.match(markup, /Shell realtime/);
  assert.match(markup, /Connected to workspace stream/);
  assert.match(markup, /formal <code>\/roadmap<\/code> entry inside AppShell navigation/);
  assert.match(markup, /Save roadmap/);
  assert.match(markup, /Save project data/);
});

test('migration web gate: terminal page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('terminal');

  assert.match(markup, /data-shell-route="terminal"/);
  assert.match(markup, /data-route-page="terminal"/);
  assert.match(markup, /Session attach and output stream shell/);
  assert.match(markup, /terminal\.attach/);
  assert.match(markup, /terminal\.snapshot/);
  assert.match(markup, /terminal\.delta/);
  assert.match(markup, /terminal\.status/);
  assert.match(markup, /Snapshot is authoritative and replaces the rendered buffer/i);
  assert.match(markup, /Connected to workspace stream/);
  assert.match(markup, /data-terminal-runtime="connected-panel"/);
  assert.match(markup, /Attach a terminal session to start streaming output\./);
  assert.match(markup, /terminal-session-picker/);
  assert.match(markup, /Choose whose execution to watch/);
});

test('migration web gate: settings page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('settings');

  assert.match(markup, /data-shell-route="settings"/);
  assert.match(markup, /data-route-page="settings"/);
  assert.match(markup, /Workspace-level defaults and operational guardrails/);
  assert.match(markup, /Single global error outlet/);
  assert.match(markup, /Registered app surfaces/);
});

test('migration web gate: system page enters through AppShell route outlet', () => {
  const markup = renderShellRoute('system');

  assert.match(markup, /data-shell-route="system"/);
  assert.match(markup, /data-route-page="system"/);
  assert.match(markup, /Observability, health, and control-plane signals/);
  assert.match(markup, /Shell notices/);
});
