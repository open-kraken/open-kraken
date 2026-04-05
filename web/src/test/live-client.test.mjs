import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../../../scripts/mock-server/server.mjs';
import { createApiClient } from '../api/create-client.mjs';

test('live client talks to mock server with the same contract shape', async () => {
  const server = await startMockServer();
  const client = createApiClient({
    env: {
      OPEN_KRAKEN_API_MODE: 'live',
      OPEN_KRAKEN_API_BASE_URL: server.url,
      OPEN_KRAKEN_WS_BASE_URL: server.wsUrl,
      OPEN_KRAKEN_WORKSPACE_ID: 'ws_open_kraken'
    }
  });
  const conversations = await client.getConversations();
  const members = await client.getMembers();
  const roadmap = await client.getRoadmap();
  const projectData = await client.getProjectData();
  const attached = await client.attachTerminal('term_owner_1');
  assert.equal(conversations.conversations[0].id, 'conv_general');
  assert.equal(members.members.members[0].workspaceId, 'ws_open_kraken');
  assert.equal(roadmap.roadmap.objective, 'Stabilize the open-kraken migration shell.');
  assert.equal(projectData.payload.projectName, 'open-kraken');
  assert.equal(attached.snapshot.terminalId, 'term_owner_1');
  await server.close();
});
