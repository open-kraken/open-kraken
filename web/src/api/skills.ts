/**
 * API client for Skill catalog and member bindings (T10).
 * Paths are relative to VITE_API_BASE_URL (default …/api/v1).
 */

import { getHttpClient } from '@/api/http-binding';
import type { Skill, SkillCategory, MemberSkills } from '@/types/skill';

export type SkillsListResponse = { skills: Skill[] };
export type MemberSkillsResponse = MemberSkills;
export type UpdateMemberSkillsInput = { skills: Skill[] };
export type SkillsReloadResponse = { loaded?: number; skipped?: number; reloadedAt?: string };

const CATEGORIES: SkillCategory[] = ['tech-lead', 'golang', 'react', 'qa', 'devops', 'other'];

function mapSkill(raw: Record<string, unknown>): Skill {
  const c = String(raw.category ?? 'other');
  const category = (CATEGORIES.includes(c as SkillCategory) ? c : 'other') as SkillCategory;
  return {
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    path: String(raw.path ?? ''),
    category
  };
}

/** GET /skills */
export const getSkills = async (): Promise<SkillsListResponse> => {
  const http = getHttpClient();
  const body = await http.get<{ items?: Record<string, unknown>[] }>('/skills');
  const items = body.items ?? [];
  return { skills: items.map((row) => mapSkill(row)) };
};

/** POST /skills/reload */
export const reloadSkills = async (): Promise<SkillsReloadResponse> => {
  const http = getHttpClient();
  return http.post<SkillsReloadResponse>('/skills/reload', {});
};

/** GET /members/{id}/skills */
export const getMemberSkills = async (memberId: string): Promise<MemberSkillsResponse> => {
  const http = getHttpClient();
  return http.get<MemberSkillsResponse>(`/members/${encodeURIComponent(memberId)}/skills`);
};

/** PUT /members/{id}/skills — body uses skill names only. */
export const updateMemberSkills = async (memberId: string, input: UpdateMemberSkillsInput): Promise<MemberSkillsResponse> => {
  const http = getHttpClient();
  return http.request<MemberSkillsResponse>(`/members/${encodeURIComponent(memberId)}/skills`, {
    method: 'PUT',
    body: { skills: input.skills.map((s) => s.name) }
  });
};
