import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHttpClient } from '@/api/http-binding';
import type { HttpClient } from '@/api/http-client';
import { deregisterNode, getNodes, registerNode } from '@/api/nodes';
import { getAgentStatuses } from '@/api/agents';

test('getNodes maps assigned agents and capacity from backend response', async () => {
  bindHttpClient({
    get: async () => ({
      items: [
        {
          id: 'node-1',
          hostname: 'worker-1',
          nodeType: 'k8s_pod',
          status: 'online',
          labels: { agent_id: 'legacy-agent' },
          maxAgents: 3,
          agentCount: 2,
          agents: ['agent-a', 'agent-b'],
          registeredAt: '2026-04-27T00:00:00Z',
          lastHeartbeatAt: '2026-04-27T00:01:00Z',
        },
      ],
    }),
  } as unknown as HttpClient);

  const response = await getNodes();

  assert.deepEqual(response.nodes[0].assignedAgents, ['agent-a', 'agent-b', 'legacy-agent']);
  assert.equal(response.nodes[0].maxAgents, 3);
  assert.equal(response.nodes[0].agentCount, 2);
});

test('getAgentStatuses normalizes unified agent status response', async () => {
  bindHttpClient({
    get: async (path: string) => {
      assert.equal(path, '/agents/status?workspaceId=ws_1');
      return {
        agents: [
          {
            agentId: 'agent-a',
            nodeId: 'node-1',
            presence: { status: 'online', lastHeartbeat: '2026-04-27T00:01:00Z' },
            terminal: { terminalId: 'term-1', status: 'running', command: 'npm test' },
            agentInstanceId: 'inst-1',
            runtimeState: 'idle',
            agentType: 'assistant',
            provider: 'shell',
            runtimeReady: true,
            tokens: { totalInput: 100, totalOutput: 25, totalCost: 0.04 },
            activeTasks: 2,
          },
        ],
      };
    },
  } as unknown as HttpClient);

  const response = await getAgentStatuses('ws_1');

  assert.deepEqual(response.agents[0], {
    agentId: 'agent-a',
    nodeId: 'node-1',
    nodeHostname: '',
    presenceStatus: 'online',
    lastHeartbeat: '2026-04-27T00:01:00Z',
    terminalId: 'term-1',
    terminalStatus: 'running',
    command: 'npm test',
    activeTasks: 2,
    agentInstanceId: 'inst-1',
    runtimeState: 'idle',
    agentType: 'assistant',
    provider: 'shell',
    runtimeReady: true,
    totalInputTokens: 100,
    totalOutputTokens: 25,
    totalCost: 0.04,
  });
});

test('registerNode posts backend scheduler registration payload', async () => {
  bindHttpClient({
    post: async (path: string, body: unknown) => {
      assert.equal(path, '/nodes/register');
      assert.deepEqual(body, {
        id: 'node-2',
        hostname: 'worker-2',
        nodeType: 'bare_metal',
        labels: { region: 'us-east' },
        workspaceId: 'ws_1',
        maxAgents: 6,
      });
      return {
        id: 'node-2',
        hostname: 'worker-2',
        nodeType: 'bare_metal',
        status: 'online',
        labels: { region: 'us-east' },
        maxAgents: 6,
        agents: [],
      };
    },
  } as unknown as HttpClient);

  const response = await registerNode({
    id: 'node-2',
    hostname: 'worker-2',
    nodeType: 'bare_metal',
    labels: { region: 'us-east' },
    workspaceId: 'ws_1',
    maxAgents: 6,
  });

  assert.equal(response.node.id, 'node-2');
  assert.equal(response.node.nodeType, 'bare_metal');
  assert.equal(response.node.maxAgents, 6);
});

test('deregisterNode deletes the selected node', async () => {
  bindHttpClient({
    request: async (path: string, init: { method?: string }) => {
      assert.equal(path, '/nodes/node-2');
      assert.equal(init.method, 'DELETE');
    },
  } as unknown as HttpClient);

  await deregisterNode('node-2');
});
