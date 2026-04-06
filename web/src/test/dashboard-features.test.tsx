import test from 'node:test';
import assert from 'node:assert/strict';

// Verify that dashboard feature modules export the expected components.
test('dashboard feature modules are importable', async () => {
  const { TeamTokenSummary } = await import('../features/dashboard/TeamTokenSummary.tsx');
  assert.ok(TeamTokenSummary, 'TeamTokenSummary should be exported');

  const { NodeTokenBreakdown } = await import('../features/dashboard/NodeTokenBreakdown.tsx');
  assert.ok(NodeTokenBreakdown, 'NodeTokenBreakdown should be exported');

  const { AgentActivityPanel } = await import('../features/dashboard/AgentActivityPanel.tsx');
  assert.ok(AgentActivityPanel, 'AgentActivityPanel should be exported');

  const { TokenChart } = await import('../features/dashboard/TokenChart.tsx');
  assert.ok(TokenChart, 'TokenChart should be exported');
});
