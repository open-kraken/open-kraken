import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHttpClient } from '@/api/http-binding';
import type { HttpClient } from '@/api/http-client';
import { claimQueueTaskById, createQueueTask, listQueueTasks } from '@/api/taskqueue';

test('taskqueue client lists and maps backend tasks', async () => {
  bindHttpClient({
    get: async (path: string) => {
      assert.equal(path, '/queue/tasks?workspaceId=ws_1');
      return {
        items: [
          {
            id: 'task-1',
            workspaceId: 'ws_1',
            type: 'manual-task',
            payload: '{"label":"Implement API"}',
            priority: 2,
            status: 'pending',
            queue: 'default',
            createdAt: 100,
            updatedAt: 200,
          },
        ],
      };
    },
  } as unknown as HttpClient);

  const tasks = await listQueueTasks({ workspaceId: 'ws_1' });

  assert.equal(tasks[0].id, 'task-1');
  assert.equal(tasks[0].status, 'pending');
  assert.equal(tasks[0].queue, 'default');
});

test('taskqueue client creates tasks with workspace default and claims by id', async () => {
  const calls: string[] = [];
  bindHttpClient({
    workspaceId: 'ws_default',
    post: async (path: string, body: Record<string, unknown>) => {
      calls.push(path);
      if (path === '/queue/tasks') {
        assert.equal(body.workspaceId, 'ws_default');
        assert.equal(body.type, 'manual-task');
        return { task: { id: 'task-2', type: body.type, payload: body.payload, status: 'pending' } };
      }
      assert.equal(path, '/queue/tasks/task-2/claim');
      assert.deepEqual(body, { nodeId: 'node-1', agentId: 'agent-1' });
      return { id: 'task-2', type: 'manual-task', payload: '{}', status: 'claimed', nodeId: 'node-1' };
    },
  } as unknown as HttpClient);

  const created = await createQueueTask({ type: 'manual-task', payload: '{}' });
  const claimed = await claimQueueTaskById(created.id, 'node-1', 'agent-1');

  assert.deepEqual(calls, ['/queue/tasks', '/queue/tasks/task-2/claim']);
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.nodeId, 'node-1');
});
