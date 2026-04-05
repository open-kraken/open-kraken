import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../api/create-client.mjs';

test('single env switch enables mock mode without changing consumer calls', async () => {
  const client = createApiClient({ env: { OPEN_KRAKEN_API_MODE: 'mock', OPEN_KRAKEN_WORKSPACE_ID: 'ws_open_kraken' } });
  const conversations = await client.getConversations();
  assert.equal(conversations.workspace.id, 'ws_open_kraken');
  const roadmap = await client.getRoadmap();
  assert.equal(roadmap.roadmap.tasks.length, 2);
  const projectData = await client.getProjectData();
  assert.equal(projectData.storage, 'workspace');
  assert.equal(projectData.payload.projectName, 'open-kraken');
});

test('mock client emits chat, roadmap, and terminal events with shared field names', async () => {
  const client = createApiClient({ env: { OPEN_KRAKEN_API_MODE: 'mock' } });
  const events = [];
  const unsubscribe = client.subscribe((event) => events.push(event));
  await client.sendMessage('conv_general', {
    senderId: 'owner_1',
    content: { type: 'text', text: 'check mock flow' },
    isAI: false
  });
  await client.updateRoadmap({ objective: 'Updated', tasks: [] });
  await client.attachTerminal('term_owner_1');
  unsubscribe();
  assert.deepEqual(
    events.map((event) => event.event),
    [
      'chat.delta',
      'chat.status',
      'roadmap.updated',
      'terminal.attach',
      'terminal.snapshot',
      'terminal.delta',
      'terminal.status'
    ]
  );
  assert.equal(events[0].body, 'check mock flow');
  assert.equal(events[1].messageId, events[0].messageId);
  assert.equal(events[4].terminalId, 'term_owner_1');
});
