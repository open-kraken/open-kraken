import test from 'node:test';
import assert from 'node:assert/strict';

// Verify that node feature modules are importable and export the expected components.
test('node feature modules export correctly', async () => {
  const { NodeCard } = await import('../features/nodes/NodeCard.tsx');
  assert.ok(NodeCard, 'NodeCard should be exported');

  const { NodeList } = await import('../features/nodes/NodeList.tsx');
  assert.ok(NodeList, 'NodeList should be exported');

  const { NodeStatusBadge } = await import('../features/nodes/NodeStatusBadge.tsx');
  assert.ok(NodeStatusBadge, 'NodeStatusBadge should be exported');

  const { NodeAgentAssign } = await import('../features/nodes/NodeAgentAssign.tsx');
  assert.ok(NodeAgentAssign, 'NodeAgentAssign should be exported');
});
