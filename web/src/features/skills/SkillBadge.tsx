/**
 * SkillBadge renders a compact label for a single skill (T10).
 * Used on member cards to surface which skills are bound to that member.
 * Category determines the badge colour.
 */

import type { Skill, SkillCategory } from '@/types/skill';

export type SkillBadgeProps = {
  skill: Skill;
};

const CATEGORY_COLOR: Record<SkillCategory, { bg: string; color: string }> = {
  'tech-lead': { bg: '#7c3aed', color: '#fff' },
  golang: { bg: '#00add8', color: '#fff' },
  react: { bg: '#61dafb', color: '#0f172a' },
  qa: { bg: '#059669', color: '#fff' },
  devops: { bg: '#ea580c', color: '#fff' },
  other: { bg: '#374151', color: '#d1d5db' }
};

/**
 * SkillBadge
 * Compact coloured tag displaying a skill name with category-based colour coding.
 *
 * @param skill - The skill to display as a badge.
 */
export const SkillBadge = ({ skill }: SkillBadgeProps) => {
  const { bg, color } = CATEGORY_COLOR[skill.category] ?? CATEGORY_COLOR.other;

  return (
    <span
      className={`skill-badge skill-badge--${skill.category}`}
      title={skill.description}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.7rem',
        fontWeight: 600,
        backgroundColor: bg,
        color,
        letterSpacing: '0.02em'
      }}
      aria-label={`Skill: ${skill.name} (${skill.category})`}
    >
      {skill.name}
    </span>
  );
};
