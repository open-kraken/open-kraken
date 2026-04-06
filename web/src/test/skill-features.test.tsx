import test from 'node:test';
import assert from 'node:assert/strict';

test('skill feature modules export correctly', async () => {
  const { SkillList } = await import('../features/skills/SkillList.tsx');
  assert.ok(SkillList, 'SkillList should be exported');

  const { SkillBadge } = await import('../features/skills/SkillBadge.tsx');
  assert.ok(SkillBadge, 'SkillBadge should be exported');

  const { MemberSkillPanel } = await import('../features/skills/MemberSkillPanel.tsx');
  assert.ok(MemberSkillPanel, 'MemberSkillPanel should be exported');
});
