import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppEnv } from '@/config/env';
import { HttpClient, HttpClientError } from '@/api/http-client';
import { RealtimeClient, type RealtimeEnvelope } from '@/realtime/realtime-client';

test('parseAppEnv normalizes defaults and invalid values', () => {
  const env = parseAppEnv({
    OPEN_KRAKEN_API_BASE_URL: 'not-a-url',
    OPEN_KRAKEN_WS_BASE_URL: 'ws://127.0.0.1:9001/ws/',
    OPEN_KRAKEN_WORKSPACE_ID: '  '
  });

  assert.equal(env.apiBaseUrl, 'http://127.0.0.1:8080/api/v1');
  assert.equal(env.wsBaseUrl, 'ws://127.0.0.1:9001/ws');
  assert.equal(env.defaultWorkspaceId, 'ws_open_kraken');
});

test('HttpClient wraps server errors with the required envelope', async () => {
  const client = new HttpClient({
    baseUrl: 'http://127.0.0.1:8080',
    workspaceId: 'ws_open_kraken',
    requestIdFactory: () => 'req_fixed',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 'version_conflict',
          message: 'roadmap version mismatch',
          requestId: 'req_server',
          details: { expectedVersion: 4 }
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        }
      )
  });

  await assert.rejects(
    () => client.post('/api/workspaces/current/roadmap', { version: 3 }),
    (error: unknown) => {
      assert.ok(error instanceof HttpClientError);
      assert.deepEqual(error.envelope, {
        code: 'version_conflict',
        message: 'roadmap version mismatch',
        requestId: 'req_server',
        details: { expectedVersion: 4 },
        status: 409
      });
      return true;
    }
  );
});

test('RealtimeClient reuses cursor on reconnect and rejects sequence gaps', () => {
  const openCalls: Array<string | null> = [];
  const received: RealtimeEnvelope[] = [];
  const client = new RealtimeClient({
    open: (cursor) => {
      openCalls.push(cursor);
    },
    close: () => undefined
  });

  const subscription = client.subscribe('workspace.chat', (event) => {
    received.push(event);
  });

  client.connect();
  client.dispatch({
    type: 'chat.delta',
    channel: 'workspace.chat',
    payload: { id: 'msg_1' },
    sequence: 1,
    cursor: 'cursor_1'
  });
  client.reconnect();

  assert.equal(subscription.subscriptionId.startsWith('sub_'), true);
  assert.deepEqual(openCalls, [null, 'cursor_1']);
  assert.equal(received.length, 1);

  assert.throws(() => {
    client.dispatch({
      type: 'chat.delta',
      channel: 'workspace.chat',
      payload: { id: 'msg_2' },
      sequence: 3,
      cursor: 'cursor_3'
    });
  }, /realtime_sequence_gap/);
  assert.equal(client.getStatus(), 'stale');
});
