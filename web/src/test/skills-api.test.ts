import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHttpClient } from '@/api/http-binding';
import type { HttpClient } from '@/api/http-client';
import { importSkills } from '@/api/skills';

test('skills import client uses backend import contract and maps conflicts', async () => {
  bindHttpClient({
    post: async (path: string, body: Record<string, unknown>) => {
      assert.equal(path, '/skills/import');
      assert.deepEqual(body, {
        strategy: 'validate',
        entries: [
          { memberId: 'agent-1', skillNames: ['reviewer', 'missing-skill'] },
        ],
      });
      return {
        applied: 1,
        skipped: 1,
        dryRun: true,
        conflicts: [
          { memberId: 'agent-1', skillName: 'missing-skill', reason: 'unknown_skill' },
        ],
      };
    },
  } as unknown as HttpClient);

  const result = await importSkills({
    strategy: 'validate',
    entries: [{ memberId: 'agent-1', skillNames: ['reviewer', 'missing-skill'] }],
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.applied, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.conflicts, [
    { memberId: 'agent-1', skillName: 'missing-skill', reason: 'unknown_skill' },
  ]);
});
