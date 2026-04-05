import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../../scripts/mock-server/server.mjs';

test('mock server covers chat, members, roadmap, and terminal attach flows', async () => {
  const server = await startMockServer();
  const health = await fetch(`${server.url}/healthz`).then((response) => response.json());
  assert.equal(health.ok, true);

  const conversations = await fetch(`${server.url}/api/workspaces/ws_open_kraken/conversations`).then((response) =>
    response.json()
  );
  assert.equal(conversations.conversations[0].id, 'conv_general');

  const chatEvent = await fetch(`${server.url}/api/workspaces/ws_open_kraken/conversations/conv_general/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      senderId: 'owner_1',
      content: { type: 'text', text: 'smoke chat flow' },
      isAI: false
    })
  }).then((response) => response.json());
  assert.equal(chatEvent.message.content.text, 'smoke chat flow');
  assert.equal(chatEvent.message.status, 'sent');

  const membersEvent = await fetch(`${server.url}/api/workspaces/ws_open_kraken/members/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: 'member_1', terminalStatus: 'working' })
  }).then((response) => response.json());
  assert.equal(membersEvent.event, 'friends.snapshot.updated');

  const roadmapEvent = await fetch(`${server.url}/api/workspaces/ws_open_kraken/roadmap`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ readOnly: false, roadmap: { objective: 'Smoke Updated', tasks: [] } })
  }).then((response) => response.json());
  assert.equal(roadmapEvent.readOnly, false);
  assert.equal(roadmapEvent.storage, 'workspace');
  assert.equal(roadmapEvent.roadmap.objective, 'Smoke Updated');

  const attach = await fetch(`${server.url}/api/workspaces/ws_open_kraken/terminal/sessions/term_owner_1/attach`).then(
    (response) => response.json()
  );
  assert.equal(attach.session.terminalId, 'term_owner_1');
  assert.equal(attach.snapshot.seq, 1);
  await server.close();
});
