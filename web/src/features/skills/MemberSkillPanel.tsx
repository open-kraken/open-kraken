/**
 * MemberSkillPanel shows and manages the skills bound to a specific member (T10).
 * Displays currently assigned skills as SkillBadges and allows removing them.
 * An "Add skill" inline section (via SkillList) lets the user bind new skills.
 */

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Skill } from '@/types/skill';
import { getMemberSkills, updateMemberSkills } from '@/api/skills';
import { SkillBadge } from './SkillBadge';
import { SkillList } from './SkillList';

export type MemberSkillPanelProps = {
  memberId: string;
  memberName: string;
  /** Full list of available skills to show in the add section. */
  availableSkills: Skill[];
};

/**
 * MemberSkillPanel
 * Manages skill assignment for a single workspace member.
 * Loads current skills from the API and syncs mutations back.
 *
 * @param memberId - The ID of the member whose skills are being managed.
 * @param memberName - Display name shown in the panel header.
 * @param availableSkills - Catalogue of all available skills for the add section.
 */
export const MemberSkillPanel = ({ memberId, memberName, availableSkills }: MemberSkillPanelProps) => {
  const { t } = useI18n();
  const [assignedSkills, setAssignedSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Load member's current skills on mount / memberId change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getMemberSkills(memberId).then((res) => {
      if (!cancelled) {
        setAssignedSkills(res.skills);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  /** Remove a skill from the member and persist. */
  const handleRemove = useCallback(async (skillPath: string) => {
    const next = assignedSkills.filter((s) => s.path !== skillPath);
    setAssignedSkills(next);
    await updateMemberSkills(memberId, { skills: next });
  }, [assignedSkills, memberId]);

  /** Add a skill to the member and persist; ignore duplicates. */
  const handleAdd = useCallback(async (skill: Skill) => {
    if (assignedSkills.some((s) => s.path === skill.path)) return;
    const next = [...assignedSkills, skill];
    setAssignedSkills(next);
    await updateMemberSkills(memberId, { skills: next });
  }, [assignedSkills, memberId]);

  // Skills not yet assigned to this member (available to add)
  const addableSkills = availableSkills.filter(
    (s) => !assignedSkills.some((a) => a.path === s.path)
  );

  return (
    <div
      className="member-skill-panel"
      data-member-id={memberId}
      style={{ padding: '16px', border: '1px solid #374151', borderRadius: '8px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{t('memberSkill.title', { name: memberName })}</h3>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          style={{
            fontSize: '0.75rem',
            padding: '3px 10px',
            borderRadius: '4px',
            border: `1px solid ${showAdd ? '#374151' : '#6366f1'}`,
            color: showAdd ? '#9ca3af' : '#6366f1',
            background: 'transparent',
            cursor: 'pointer'
          }}
        >
          {showAdd ? t('memberSkill.close') : t('memberSkill.add')}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>{t('memberSkill.loading')}</p>
      )}

      {/* Assigned skills */}
      {!loading && assignedSkills.length === 0 && !showAdd && (
        <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>{t('memberSkill.none')}</p>
      )}

      {!loading && assignedSkills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: showAdd ? '16px' : 0 }}>
          {assignedSkills.map((skill) => (
            <span
              key={skill.path}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <SkillBadge skill={skill} />
              <button
                type="button"
                aria-label={t('memberSkill.removeAria', { name: skill.name })}
                onClick={() => void handleRemove(skill.path)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#6b7280',
                  fontSize: '0.75rem',
                  padding: '0 2px'
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Inline add section */}
      {showAdd && (
        <div style={{ marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '12px' }}>
          <SkillList skills={addableSkills} onAdd={(skill) => void handleAdd(skill)} />
        </div>
      )}
    </div>
  );
};
