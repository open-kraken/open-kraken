import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgentStatus, summarizeAgents, summarizeNodes } from '@/shared/status-model';

test('node status summary uses the canonical online/degraded/offline model', () => {
  const summary = summarizeNodes([
    { status: 'online' },
    { status: 'degraded' },
    { status: 'offline' },
    { status: 'unknown' as never },
  ]);

  assert.deepEqual(summary, { total: 4, online: 1, degraded: 1, offline: 2 });
});

test('agent status resolves runtime before conflicting terminal telemetry', () => {
  assert.equal(
    resolveAgentStatus({ runtimeState: 'idle', terminalStatus: 'working', presenceStatus: 'online' }),
    'idle',
  );
  assert.equal(resolveAgentStatus({ activeTasks: 1, runtimeState: 'idle' }), 'running');
  assert.equal(resolveAgentStatus({ runtimeState: 'crashed', activeTasks: 1 }), 'error');
  assert.deepEqual(
    summarizeAgents([
      { activeTasks: 1 },
      { runtimeState: 'idle', terminalStatus: 'working' },
      { presenceStatus: 'offline' },
    ]),
    { total: 3, running: 1, idle: 1, error: 0, offline: 1 },
  );
});
