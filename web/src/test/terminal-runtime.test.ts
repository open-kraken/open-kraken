import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerminalPanelController } from '@/pages/terminal/terminal-runtime';
import { RealtimeClient } from '@/realtime/realtime-client';

const createTestApi = () => {
  const listeners = new Set<(event: unknown) => void>();
  const attachCalls: string[] = [];
  const notifications: Array<{ title: string; detail: string }> = [];

  return {
    attachCalls,
    notifications,
    apiClient: {
      async attachTerminal(terminalId: string) {
        attachCalls.push(terminalId);
        return {
          session: {
            terminalId,
            memberId: 'owner_1',
            workspaceId: 'ws_open_kraken',
            terminalType: 'codex',
            command: 'npm run verify:migration',
            status: 'attached'
          },
          snapshot: {
            terminalId,
            seq: 1,
            buffer: {
              data: '$ attach\n'
            }
          }
        };
      },
      subscribe(listener: (event: unknown) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    },
    emit(event: unknown) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    pushNotification(notification: { title: string; detail: string }) {
      notifications.push(notification);
    }
  };
};

const resolveTestMemberSession = async (_workspaceId: string, memberId: string) => `term_${memberId}`;

test('terminal controller drives attach and canonical realtime flow for the real page container', async () => {
  const testApi = createTestApi();
  const controller = createTerminalPanelController({
    apiClient: testApi.apiClient,
    pushNotification: testApi.pushNotification,
    initialTerminalId: 'term_owner_1',
    resolveMemberSession: resolveTestMemberSession
  });

  await controller.attach();
  await controller.handleRealtimeEvent({
    event: 'terminal.delta',
    workspaceId: 'ws_open_kraken',
    terminalId: 'term_owner_1',
    seq: 2,
    data: 'next\n'
  });
  await controller.handleRealtimeEvent({
    event: 'terminal.status',
    workspaceId: 'ws_open_kraken',
    terminalId: 'term_owner_1',
    status: 'exited',
    seq: 3,
    connectionState: 'disconnected',
    processState: 'exited'
  });

  const state = controller.getState();
  assert.deepEqual(testApi.attachCalls, ['term_owner_1']);
  assert.equal(state.session?.terminalId, 'term_owner_1');
  assert.equal(state.output.text, '$ attach\nnext\n');
  assert.equal(state.runtime.process, 'exited');
});

test('terminal controller normalizes legacy websocket names and requests resync on seq gaps', async () => {
  const testApi = createTestApi();
  const controller = createTerminalPanelController({
    apiClient: testApi.apiClient,
    pushNotification: testApi.pushNotification,
    initialTerminalId: 'term_owner_1',
    resolveMemberSession: resolveTestMemberSession
  });

  await controller.handleRealtimeEvent({
    event: 'terminal.snapshot',
    terminalId: 'term_owner_1',
    seq: 1,
    rows: 24,
    cols: 80,
    buffer: 'boot\n',
    connectionState: 'attached',
    processState: 'running'
  });

  await controller.handleRealtimeEvent({
    event: 'terminal.delta',
    terminalId: 'term_owner_1',
    sequence: 6,
    data: 'gap\n'
  });

  const state = controller.getState();
  assert.deepEqual(testApi.attachCalls, ['term_owner_1']);
  assert.equal(state.output.text, '$ attach\n');
  assert.equal(testApi.notifications.length, 1);
  assert.match(testApi.notifications[0].detail, /delta seq gap/);
});

test('shared realtime transport handshake and canonical terminal events drive the terminal controller state', async () => {
  const testApi = createTestApi();
  const sentMessages: unknown[] = [];
  const realtimeClient = new RealtimeClient({
    open: () => undefined,
    close: () => undefined,
    send: (message) => {
      sentMessages.push(message);
      return true;
    }
  });
  const controller = createTerminalPanelController({
    apiClient: testApi.apiClient,
    realtimeClient,
    pushNotification: testApi.pushNotification,
    initialTerminalId: 'term_owner_1',
    resolveMemberSession: resolveTestMemberSession
  });

  realtimeClient.subscribe('workspace', (event) => {
    void controller.handleRealtimeEvent(event);
  });

  await controller.attach();
  assert.deepEqual(sentMessages, [
    {
      type: 'terminal.attach',
      payload: {
        sessionId: 'term_owner_1',
        subscriberId: 'web_terminal_term_owner_1',
        afterSeq: 0
      }
    }
  ]);

  realtimeClient.dispatch({
    type: 'handshake.accepted',
    channel: 'workspace',
    sequence: 1,
    cursor: 'rt_0001',
    payload: {
      workspaceId: 'ws_open_kraken',
      memberId: 'owner_1',
      subscriptionScope: {
        terminal: ['term_owner_1']
      },
      resyncRequired: false,
      recovery: {
        mode: 'replay',
        lastAckCursor: 'rt_0001',
        resyncRequired: false,
        terminalReplay: 'delta_after_snapshot',
        dedupeKey: 'cursor_then_terminal_seq'
      }
    }
  });
  realtimeClient.dispatch({
    type: 'terminal.attach',
    channel: 'workspace',
    sequence: 2,
    cursor: 'rt_0002',
    payload: {
      workspaceId: 'ws_open_kraken',
      terminalId: 'term_owner_1',
      payload: {
        terminalId: 'term_owner_1',
        connectionState: 'attached',
        processState: 'running'
      }
    }
  });
  realtimeClient.dispatch({
    type: 'terminal.snapshot',
    channel: 'workspace',
    sequence: 3,
    cursor: 'rt_0003',
    payload: {
      workspaceId: 'ws_open_kraken',
      terminalId: 'term_owner_1',
      payload: {
        terminalId: 'term_owner_1',
        rows: 24,
        cols: 80,
        buffer: '$ attach\n',
        connectionState: 'attached',
        processState: 'running'
      }
    }
  });
  realtimeClient.dispatch({
    type: 'terminal.delta',
    channel: 'workspace',
    sequence: 4,
    cursor: 'rt_0004',
    payload: {
      workspaceId: 'ws_open_kraken',
      terminalId: 'term_owner_1',
      payload: {
        terminalId: 'term_owner_1',
        sequence: 2,
        data: 'stream\n'
      }
    }
  });
  realtimeClient.dispatch({
    type: 'terminal.status',
    channel: 'workspace',
    sequence: 5,
    cursor: 'rt_0005',
    payload: {
      workspaceId: 'ws_open_kraken',
      terminalId: 'term_owner_1',
      payload: {
        terminalId: 'term_owner_1',
        connectionState: 'disconnected',
        processState: 'exited'
      }
    }
  });

  const state = controller.getState();
  assert.equal(state.session?.terminalId, 'term_owner_1');
  assert.equal(state.output.text, '$ attach\nstream\n');
  assert.equal(state.output.lastSeq, 2);
  assert.equal(state.runtime.connection, 'disconnected');
  assert.equal(state.runtime.process, 'exited');
});

test('backend websocket event payload fields survive realtime envelope normalization', async () => {
  const testApi = createTestApi();
  const realtimeClient = new RealtimeClient({
    open: () => undefined,
    close: () => undefined
  });
  const controller = createTerminalPanelController({
    apiClient: testApi.apiClient,
    realtimeClient,
    pushNotification: testApi.pushNotification,
    initialTerminalId: 'term_owner_1',
    resolveMemberSession: resolveTestMemberSession
  });

  realtimeClient.subscribe('workspace', (event) => {
    void controller.handleRealtimeEvent(event);
  });

  await controller.attach();
  realtimeClient.dispatch({
    cursor: 'rt_0100',
    name: 'terminal.delta',
    workspaceId: 'ws_open_kraken',
    memberId: 'owner_1',
    terminalId: 'term_owner_1',
    payload: {
      terminalId: 'term_owner_1',
      sequence: 2,
      data: 'live\n'
    }
  });

  assert.equal(controller.getState().output.text, '$ attach\nlive\n');
});

test('handshake resync requests a fresh attach for the active terminal', async () => {
  const testApi = createTestApi();
  const controller = createTerminalPanelController({
    apiClient: testApi.apiClient,
    pushNotification: testApi.pushNotification,
    initialTerminalId: 'term_owner_1',
    resolveMemberSession: resolveTestMemberSession
  });

  await controller.attach();
  await controller.handleRealtimeEvent({
    type: 'handshake.accepted',
    channel: 'workspace',
    sequence: 1,
    cursor: 'rt_0001',
    payload: {
      workspaceId: 'ws_open_kraken',
      memberId: 'owner_1',
      resyncRequired: true
    }
  });

  const state = controller.getState();
  assert.deepEqual(testApi.attachCalls, ['term_owner_1', 'term_owner_1']);
  assert.equal(state.output.text, '$ attach\n');
  assert.equal(testApi.notifications.length, 1);
  assert.match(testApi.notifications[0].detail, /handshake requested snapshot resync/);
});

test('realtime client queues outbound messages until the websocket is connected', () => {
  let ready = false;
  const sent: unknown[] = [];
  const realtimeClient = new RealtimeClient({
    open: () => undefined,
    close: () => {
      ready = false;
    },
    send: (message) => {
      if (!ready) {
        return false;
      }
      sent.push(message);
      return true;
    }
  });

  realtimeClient.connect();
  realtimeClient.send({ type: 'terminal.attach', payload: { sessionId: 'session-1' } });
  assert.deepEqual(sent, []);

  ready = true;
  realtimeClient.markConnected();
  assert.deepEqual(sent, [
    { type: 'terminal.attach', payload: { sessionId: 'session-1' } }
  ]);
});
