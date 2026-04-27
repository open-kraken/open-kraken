import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHttpClient } from '@/api/http-binding';
import { listTerminalSessions, resolveOrCreateMemberSession } from '@/api/terminal';
import type { HttpClient } from '@/api/http-client';

test('terminal API maps backend sessionId to frontend terminalId', async () => {
  bindHttpClient({
    get: async () => ({
      items: [
        {
          sessionId: 'session-1',
          memberId: 'owner_1',
          workspaceId: 'ws_open_kraken',
          terminalType: 'shell',
          command: 'bash',
          status: 'running',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:01Z'
        }
      ]
    })
  } as unknown as HttpClient);

  const result = await listTerminalSessions('ws_open_kraken');

  assert.equal(result.items[0].terminalId, 'session-1');
  assert.equal(result.items[0].memberId, 'owner_1');
});

test('terminal API accepts sessionId when creating a member session', async () => {
  bindHttpClient({
    get: async () => ({ found: false, sessionId: '' }),
    post: async () => ({ sessionId: 'session-created' })
  } as unknown as HttpClient);

  const sessionId = await resolveOrCreateMemberSession('ws_open_kraken', 'owner_1');

  assert.equal(sessionId, 'session-created');
});
