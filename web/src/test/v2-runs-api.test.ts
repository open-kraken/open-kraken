import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, listRunFlows, listRuns } from '@/api/v2/runs';
import { createFlow, createStep, getFlowSteps } from '@/api/v2/steps';

const withFetch = async (
  handler: (url: string, init?: RequestInit) => unknown,
  run: () => Promise<void>,
) => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(input), init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = previous;
  }
};

test('v2 runs client unwraps backend list envelopes and normalizes camelCase DTO fields', async () => {
  await withFetch(
    (url) => {
      assert.match(url, /\/api\/v2\/runs\?tenant_id=default&limit=10$/);
      return {
        items: [
          {
            id: 'run-1',
            tenantId: 'default',
            hiveId: 'team_core',
            state: 'pending',
            objective: 'ship feature',
            tokenBudget: 1000,
            tokensUsed: 25,
            createdAt: '2026-04-28T00:00:00Z',
            updatedAt: '2026-04-28T00:00:01Z',
          },
        ],
        total: 1,
      };
    },
    async () => {
      const runs = await listRuns({ tenant_id: 'default', limit: 10 });
      assert.equal(runs.length, 1);
      assert.equal(runs[0].hive_id, 'team_core');
      assert.equal(runs[0].token_budget, 1000);
      assert.equal(runs[0].tokens_used, 25);
      assert.equal(runs[0].created_at, '2026-04-28T00:00:00Z');
    },
  );
});

test('v2 runs client creates runs, flows, and steps with backend DTO normalization', async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  await withFetch(
    (url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init?.method, body });
      if (url.endsWith('/api/v2/runs')) {
        assert.equal(body.objective, 'test objective');
        return { id: 'run-2', tenantId: body.tenant_id, hiveId: body.hive_id, state: 'pending', tokenBudget: 2000, tokensUsed: 0 };
      }
      if (url.endsWith('/api/v2/flows')) {
        return { id: 'flow-1', runId: body.run_id, tenantId: body.tenant_id, agentRole: body.agent_role, state: 'pending' };
      }
      if (url.endsWith('/api/v2/steps')) {
        return {
          id: 'step-1',
          flowId: body.flow_id,
          runId: body.run_id,
          tenantId: body.tenant_id,
          workloadClass: body.workload_class,
          regime: body.regime,
          agentType: body.agent_type,
          provider: body.provider,
          state: 'pending',
        };
      }
      if (url.endsWith('/api/v2/runs/run-2/flows')) {
        return { items: [{ id: 'flow-1', runId: 'run-2', tenantId: 'default', agentRole: 'assistant', state: 'pending' }] };
      }
      if (url.endsWith('/api/v2/flows/flow-1/steps')) {
        return { items: [{ id: 'step-1', flowId: 'flow-1', runId: 'run-2', tenantId: 'default', workloadClass: 'general', state: 'pending' }] };
      }
      throw new Error(`unexpected URL ${url}`);
    },
    async () => {
      const run = await createRun({ tenant_id: 'default', hive_id: 'team_core', objective: 'test objective', token_budget: 2000 });
      const flow = await createFlow({ run_id: run.id, tenant_id: run.tenant_id, agent_role: 'assistant' });
      const step = await createStep({
        flow_id: flow.id,
        run_id: run.id,
        tenant_id: run.tenant_id,
        workload_class: 'general',
        regime: 'OPAQUE',
        agent_type: 'assistant',
        provider: 'codex',
      });
      const flows = await listRunFlows(run.id);
      const steps = await getFlowSteps(flow.id);

      assert.equal(run.hive_id, 'team_core');
      assert.equal(flow.run_id, 'run-2');
      assert.equal(flow.agent_role, 'assistant');
      assert.equal(step.flow_id, 'flow-1');
      assert.equal(step.workload_class, 'general');
      assert.equal(flows[0].run_id, 'run-2');
      assert.equal(steps[0].flow_id, 'flow-1');
      assert.equal(calls.length, 5);
    },
  );
});
