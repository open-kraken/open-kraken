/**
 * SkillList displays all available workspace skills grouped by category (T10).
 * Supports text search filtering by name or description.
 */

import { useState, useMemo } from 'react';
import type { Skill, SkillCategory } from '@/types/skill';
import { SkillBadge } from './SkillBadge';

export type SkillListProps = {
  skills: Skill[];
  /** If provided, shows an "Add" button per skill for the currently focused member. */
  onAdd?: (skill: Skill) => void;
};

/** Canonical display order for skill categories. */
const CATEGORY_ORDER: SkillCategory[] = ['tech-lead', 'golang', 'react', 'qa', 'devops', 'other'];

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  'tech-lead': 'Tech Lead',
  golang: 'Go / Backend',
  react: 'React / Frontend',
  qa: 'QA',
  devops: 'DevOps',
  other: 'Other'
};

/**
 * SkillList
 * Renders all available skills organised by category with an optional search bar.
 *
 * @param skills - The full catalogue of available skills.
 * @param onAdd - Optional callback to add a skill to the current member.
 */
export const SkillList = ({ skills, onAdd }: SkillListProps) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const lower = query.toLowerCase().trim();
    if (!lower) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.category.toLowerCase().includes(lower)
    );
  }, [skills, query]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<SkillCategory, Skill[]>();
    for (const s of filtered) {
      const existing = map.get(s.category);
      if (existing) {
        existing.push(s);
      } else {
        map.set(s.category, [s]);
      }
    }
    return map;
  }, [filtered]);

  return (
    <div className="skill-list">
      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="search"
          placeholder="Search skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search skills"
          style={{
            width: '100%',
            padding: '7px 12px',
            borderRadius: '6px',
            border: '1px solid #374151',
            backgroundColor: '#1f2937',
            color: '#e5e7eb',
            fontSize: '0.875rem',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {filtered.length === 0 && (
        <p style={{ color: '#6b7280' }}>No skills match your search.</p>
      )}

      {/* Category groups */}
      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
        <div key={cat} style={{ marginBottom: '20px' }}>
          <h3
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px'
            }}
          >
            {CATEGORY_LABEL[cat]}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(grouped.get(cat) ?? []).map((skill) => (
              <div
                key={skill.path}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <SkillBadge skill={skill} />
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{skill.description}</span>
                </div>
                {onAdd && (
                  <button
                    type="button"
                    onClick={() => onAdd(skill)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      border: '1px solid #16a34a',
                      color: '#16a34a',
                      background: 'transparent',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
