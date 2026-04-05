/**
 * API client for Skill assignment endpoints (T10).
 * Matches:
 *   GET    /api/skills                        — list all available skills
 *   GET    /api/members/{id}/skills           — get skills bound to a member
 *   PUT    /api/members/{id}/skills           — replace member's skill set
 *
 * Backend is not yet complete — all functions fall back to mock data.
 * Remove mock branches once real endpoints are live.
 */

import type { Skill, MemberSkills } from '@/types/skill';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_SKILLS: Skill[] = [
  { name: 'Tech Lead Pro', description: 'Architecture decisions and cross-team alignment', path: 'skills/tech-lead/tech-lead-pro.md', category: 'tech-lead' },
  { name: 'Golang Senior Pro', description: 'Backend development with Go, TDD-first', path: 'skills/software-engineer/golang/golang-senior-pro.md', category: 'golang' },
  { name: 'React Frontend Engineer Pro', description: 'React + TypeScript production frontend', path: 'skills/software-engineer/react/react-frontend-engineer-pro.md', category: 'react' },
  { name: 'QA Engineer Pro', description: 'Test strategy, defect management, quality gates', path: 'skills/qa-engineer/qa-engineer-pro.md', category: 'qa' },
  { name: 'DevOps Engineer Pro', description: 'CI/CD pipelines, deployment, monitoring', path: 'skills/devops-engineer/devops-engineer-pro.md', category: 'devops' },
  { name: 'Product Manager Pro', description: 'Requirement definition and delivery management', path: 'skills/product-manager/product-manager-pro.md', category: 'other' }
];

// Mutable map of memberId → assigned skills (starts with a few pre-assigned)
const MOCK_MEMBER_SKILLS: Record<string, Skill[]> = {
  'agent-frontend-1': [MOCK_SKILLS[2]],
  'agent-backend-1': [MOCK_SKILLS[1]],
  'agent-qa-1': [MOCK_SKILLS[3]],
  'agent-lead-1': [MOCK_SKILLS[0]]
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type SkillsListResponse = { skills: Skill[] };
export type MemberSkillsResponse = MemberSkills;
export type UpdateMemberSkillsInput = { skills: Skill[] };

// ---------------------------------------------------------------------------
// Client functions
// ---------------------------------------------------------------------------

/** GET /api/skills — list all skills available in the workspace. */
export const getSkills = async (): Promise<SkillsListResponse> => {
  // TODO: return httpClient.get<SkillsListResponse>('/api/skills');
  return Promise.resolve({ skills: MOCK_SKILLS });
};

/** GET /api/members/{id}/skills — fetch skills bound to a specific member. */
export const getMemberSkills = async (memberId: string): Promise<MemberSkillsResponse> => {
  // TODO: return httpClient.get<MemberSkillsResponse>(`/api/members/${memberId}/skills`);
  return Promise.resolve({ memberId, skills: MOCK_MEMBER_SKILLS[memberId] ?? [] });
};

/** PUT /api/members/{id}/skills — replace the full skill set for a member. */
export const updateMemberSkills = async (memberId: string, input: UpdateMemberSkillsInput): Promise<MemberSkillsResponse> => {
  // TODO: return httpClient.request<MemberSkillsResponse>(`/api/members/${memberId}/skills`, { method: 'PUT', body: input });
  MOCK_MEMBER_SKILLS[memberId] = input.skills;
  return Promise.resolve({ memberId, skills: input.skills });
};
