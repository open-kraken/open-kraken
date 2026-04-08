import type { MembersResponse } from '@/api/api-client';
import type { Skill } from '@/types/skill';
import type { MemberSkillsResponse } from '@/api/skills';

export const SKILLS_SNAPSHOT_FORMAT = 'open-kraken-skills-snapshot' as const;

export type SkillsSnapshotV1 = {
  format: typeof SKILLS_SNAPSHOT_FORMAT;
  version: 1;
  exportedAt: string;
  workspaceId: string;
  catalog: Skill[];
  /** memberId → skill names (order preserved) */
  memberBindings: Record<string, string[]>;
};

export function isSkillsSnapshotV1(v: unknown): v is SkillsSnapshotV1 {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.format === SKILLS_SNAPSHOT_FORMAT &&
    o.version === 1 &&
    typeof o.exportedAt === 'string' &&
    typeof o.workspaceId === 'string' &&
    Array.isArray(o.catalog) &&
    o.memberBindings !== null &&
    typeof o.memberBindings === 'object' &&
    !Array.isArray(o.memberBindings)
  );
}

/** Collect unique member ids from workspace members response. */
export function memberIdsFromResponse(res: MembersResponse): string[] {
  const ids = new Set<string>();
  if (res.teams) {
    for (const team of res.teams) {
      for (const m of team.members) {
        if (m.memberId) ids.add(m.memberId);
      }
    }
  }
  for (const m of res.members ?? []) {
    if (m.memberId) ids.add(m.memberId);
  }
  return [...ids];
}

/** Build a versioned snapshot for download (catalog + per-member bindings). */
export async function buildSkillsSnapshot(
  workspaceId: string,
  fetchMembers: () => Promise<MembersResponse>,
  fetchCatalog: () => Promise<{ skills: Skill[] }>,
  fetchMemberSkills: (memberId: string) => Promise<MemberSkillsResponse>
): Promise<SkillsSnapshotV1> {
  const [membersRes, catalogRes] = await Promise.all([fetchMembers(), fetchCatalog()]);
  const memberIds = memberIdsFromResponse(membersRes);
  const memberBindings: Record<string, string[]> = {};
  await Promise.all(
    memberIds.map(async (id) => {
      try {
        const r = await fetchMemberSkills(id);
        memberBindings[id] = r.skills.map((s) => s.name).filter(Boolean);
      } catch {
        memberBindings[id] = [];
      }
    })
  );
  return {
    format: SKILLS_SNAPSHOT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    workspaceId,
    catalog: catalogRes.skills,
    memberBindings
  };
}

/** Map skill names to Skill objects using catalog first, then minimal stubs. */
export function skillsFromNames(names: string[], catalog: Skill[]): Skill[] {
  const byName = new Map(catalog.map((s) => [s.name, s]));
  return names.map((name) => {
    const hit = byName.get(name);
    if (hit) return hit;
    return {
      name,
      description: '',
      path: '',
      category: 'other' as const
    };
  });
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
