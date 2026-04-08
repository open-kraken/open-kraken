import type { ReactNode } from 'react';
import type { MemberFixture, TeamGroupFixture } from '@/features/members/member-page-model';

export type MentionCandidate = {
  kind: 'member' | 'team';
  id: string;
  label: string;
  /** Text after `@` (memberId or teamId). */
  insertText: string;
};

/**
 * Returns mention candidates for the composer dropdown, filtered by the query after `@`.
 */
export const filterMentionCandidates = (
  members: MemberFixture[],
  teamGroups: TeamGroupFixture[],
  query: string
): MentionCandidate[] => {
  const q = query.trim().toLowerCase();
  const memberHits: MentionCandidate[] = members
    .filter((m) => {
      const id = m.memberId.toLowerCase();
      const name = (m.displayName ?? '').toLowerCase();
      return q === '' || id.includes(q) || name.includes(q);
    })
    .map((m) => ({
      kind: 'member' as const,
      id: m.memberId,
      label: m.displayName ?? m.memberId,
      insertText: m.memberId
    }));

  const teamHits: MentionCandidate[] = teamGroups
    .filter((t) => {
      const id = t.teamId.toLowerCase();
      const name = (t.name ?? '').toLowerCase();
      return q === '' || id.includes(q) || name.includes(q);
    })
    .map((t) => ({
      kind: 'team' as const,
      id: t.teamId,
      label: t.name ?? t.teamId,
      insertText: t.teamId
    }));

  return [...memberHits, ...teamHits].slice(0, 16);
};

/**
 * If the caret is inside an `@word` token (no whitespace between `@` and caret), returns its start index and query.
 */
export const parseActiveMention = (text: string, caret: number): { start: number; query: string } | null => {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const afterAt = before.slice(at + 1);
  if (/\s/.test(afterAt)) return null;
  return { start: at, query: afterAt };
};

/**
 * Renders plain text with `@mentions` wrapped for styling.
 */
export const renderMessageWithMentions = (
  text: string,
  renderMention: (full: string, body: string, key: number) => ReactNode
): ReactNode[] => {
  const out: ReactNode[] = [];
  const re = /@([\w.-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(text.slice(last, m.index));
    }
    out.push(renderMention(m[0], m[1] ?? '', key++));
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(text.slice(last));
  }
  return out;
};
