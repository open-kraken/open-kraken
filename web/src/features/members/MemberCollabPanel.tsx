import { useState } from 'react';
import { RoleCard } from '@/components/agent/RoleCard';
import { useAppShell } from '@/state/app-shell-store';
import { MemberSkillPanel } from '@/features/skills/MemberSkillPanel';
import type { Skill } from '@/types/skill';
import type { MembersPageModel } from './member-page-model';

export type MemberCollabPanelProps = {
  model: MembersPageModel;
  /** Full catalogue of available skills for the skill assignment panel. */
  availableSkills?: Skill[];
};

export const MemberCollabPanel = ({ model, availableSkills = [] }: MemberCollabPanelProps) => {
  const { navigate } = useAppShell();
  // Track which member's skill panel is currently expanded
  const [skillPanelMemberId, setSkillPanelMemberId] = useState<string | null>(null);
  const leadMember =
    model.members.find((member) => member.role === 'owner') ??
    model.members.find((member) => member.status === 'running') ??
    model.members[0];

  return (
    <section className="members-page" data-route-page="members" data-realtime-status={model.realtimeStatus}>
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">Team</p>
          <h1>Member coordination surface</h1>
          <p className="route-page__intro">
            Roster shows roles, collaboration status, and roadmap-assigned work. <strong>PTY / command execution</strong>{' '}
            for each member is viewed under <strong>Sessions</strong> — open a member&apos;s stream with{' '}
            <em>View execution</em> below.
          </p>
        </div>
        <div className="route-page__metric-strip members-page__metrics" aria-label="Member coordination metrics">
          <div className="route-page__metric members-page__metric">
            <span className="route-page__metric-label members-page__metric-label">Agents</span>
            <strong>{model.metrics.total}</strong>
            <small>Formal workspace roster</small>
          </div>
          <div className="route-page__metric members-page__metric">
            <span className="route-page__metric-label members-page__metric-label">Running</span>
            <strong>{model.metrics.running}</strong>
            <small>Active execution slots</small>
          </div>
          <div className="route-page__metric members-page__metric">
            <span className="route-page__metric-label members-page__metric-label">Offline</span>
            <strong>{model.metrics.offline}</strong>
            <small>Needs follow-up or reconnect</small>
          </div>
        </div>
      </div>

      <div className="route-page__grid route-page__grid--members">
        <section className="route-page__panel members-page__panel members-page__panel--status">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Runtime status</p>
              <h2>Shell realtime and lead owner</h2>
            </div>
            <span className="route-page__status-pill route-page__status-pill--live">Live workspace</span>
          </header>

          <div className="members-page__status-strip">
            <span className="members-page__status-label">Shell realtime</span>
            <strong>{model.realtimeStatus}</strong>
          </div>

          {leadMember ? (
            <RoleCard
              avatarInitial={leadMember.avatarLabel}
              name={leadMember.displayName}
              role={leadMember.role}
              status={leadMember.status}
              summary={leadMember.activeTask ?? 'Owns member coordination and closes empty-task gaps before handoff.'}
            />
          ) : null}
        </section>

        <section className="route-page__panel members-page__panel members-page__panel--roster">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">Roster</p>
              <h2>Shared member cards</h2>
            </div>
            <span className="route-page__status-pill">Token-backed</span>
          </header>

          <section className="member-collab-panel member-collab-panel--desktop" aria-label="Workspace members">
            {model.members.map((member) => (
              <article
                key={member.memberId}
                className={member.cardClassName}
                data-member-id={member.memberId}
                data-terminal-id={member.terminalId}
                data-role={member.role}
                data-status={member.status}
              >
                <div className="member-card__identity">
                  <div className={`member-card__avatar member-card__avatar--${member.role}`}>
                    {member.avatarUrl ? (
                      <img
                        className="member-card__avatar-image"
                        src={member.avatarUrl}
                        alt={`${member.displayName} avatar`}
                      />
                    ) : (
                      <span className="member-card__avatar-fallback">{member.avatarLabel}</span>
                    )}
                  </div>
                  <div className="member-card__meta">
                    <strong className={member.nameClassName} title={member.displayNameTitle}>
                      {member.displayName}
                    </strong>
                    <div className="member-card__supporting">
                      <span className={`member-card__role-chip member-card__role-chip--${member.role}`}>
                        {member.roleLabel}
                      </span>
                      <span className={`member-card__status-badge member-card__status-badge--${member.status}`}>
                        {member.statusLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="member-card__task-row">
                  <div className={member.taskClassName} title={member.activeTaskLabel}>
                    <span className="member-card__task-label">Active task</span>
                    <span className="member-card__task-value">{member.activeTaskLabel}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="member-card__exec"
                      onClick={() => navigate('terminal', { hash: member.terminalId })}
                    >
                      View execution
                    </button>
                    <button
                      type="button"
                      className="member-card__exec"
                      onClick={() =>
                        setSkillPanelMemberId((prev) =>
                          prev === member.memberId ? null : member.memberId
                        )
                      }
                      aria-expanded={skillPanelMemberId === member.memberId}
                    >
                      Skills
                    </button>
                  </div>
                </div>

                {/* Inline skill management panel */}
                {skillPanelMemberId === member.memberId && (
                  <div style={{ marginTop: '12px' }}>
                    <MemberSkillPanel
                      memberId={member.memberId}
                      memberName={member.displayName}
                      availableSkills={availableSkills}
                    />
                  </div>
                )}
              </article>
            ))}
          </section>
        </section>
      </div>
    </section>
  );
};
