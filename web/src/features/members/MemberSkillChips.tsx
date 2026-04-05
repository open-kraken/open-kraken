import { useEffect, useState } from 'react';
import { getMemberSkills } from '@/api/skills';

export type MemberSkillChipsProps = {
  memberId: string;
};

/**
 * Read-only skill names for roster cards (loads GET …/members/{id}/skills).
 */
export const MemberSkillChips = ({ memberId }: MemberSkillChipsProps) => {
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getMemberSkills(memberId).then((res) => {
      if (!cancelled) {
        setLabels(res.skills.map((s) => s.name));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (loading) {
    return (
      <p className="member-card__skills member-card__skills--loading" data-member-skills={memberId}>
        Skills…
      </p>
    );
  }

  if (labels.length === 0) {
    return (
      <p className="member-card__skills member-card__skills--empty" data-member-skills={memberId}>
        No skills bound
      </p>
    );
  }

  return (
    <ul className="member-card__skill-chips" aria-label="Assigned skills" data-member-skills={memberId}>
      {labels.map((name) => (
        <li key={name} className="member-card__skill-chip">
          {name}
        </li>
      ))}
    </ul>
  );
};
