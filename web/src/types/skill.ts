/**
 * Domain types for Skill assignment (T10).
 * Skills are markdown-defined capability bundles bound to workspace members.
 */

/** High-level category grouping skills by domain. */
export type SkillCategory = 'tech-lead' | 'golang' | 'react' | 'qa' | 'devops' | 'other';

/**
 * A single Skill entry as returned by GET …/skills (under API base URL).
 * `path` is the workspace-relative path to the SKILL.md file.
 */
export interface Skill {
  name: string;
  description: string;
  path: string;
  category: SkillCategory;
}

/**
 * The set of skills bound to a specific workspace member.
 * Returned by GET …/members/{id}/skills.
 */
export interface MemberSkills {
  memberId: string;
  skills: Skill[];
}
