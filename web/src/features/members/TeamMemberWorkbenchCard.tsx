import { useI18n } from '@/i18n/I18nProvider';
import { MemberSkillPanel } from '@/features/skills/MemberSkillPanel';
import { MemberSkillChips } from '@/features/members/MemberSkillChips';
import { MemberCliPreview } from '@/features/members/MemberCliPreview';
import type { Skill } from '@/types/skill';
import type { MemberCardModel } from '@/features/members/member-page-model';
import type { MemberNodeBinding } from '@/features/members/member-runtime-map';

export type TeamMemberWorkbenchCardProps = {
  member: MemberCardModel;
  node: MemberNodeBinding | null;
  cliLines: string[];
  availableSkills: Skill[];
  skillPanelOpen: boolean;
  onToggleSkillPanel: () => void;
  onNavigateTerminal: () => void;
  onNavigateNodes: () => void;
};

const nodeStatusClass = (status: MemberNodeBinding['status']) =>
  `member-workbench__node-pill member-workbench__node-pill--${status}`;

export const TeamMemberWorkbenchCard = ({
  member,
  node,
  cliLines,
  availableSkills,
  skillPanelOpen,
  onToggleSkillPanel,
  onNavigateTerminal,
  onNavigateNodes
}: TeamMemberWorkbenchCardProps) => {
  const { t } = useI18n();
  const taskLabel = member.activeTask ? member.activeTaskLabel : t('members.noActiveTask');

  return (
    <article
      className={`member-workbench ${member.cardClassName}`}
      data-member-id={member.memberId}
      data-terminal-id={member.terminalId}
      data-role={member.role}
      data-status={member.status}
    >
      <div className="member-workbench__header">
        <div className="member-workbench__identity">
          <div className={`member-card__avatar member-card__avatar--${member.role}`}>
            {member.avatarUrl ? (
              <img className="member-card__avatar-image" src={member.avatarUrl} alt="" />
            ) : (
              <span className="member-card__avatar-fallback">{member.avatarLabel}</span>
            )}
          </div>
          <div className="member-workbench__title-block">
            <div className="member-workbench__name-row">
              <strong className={member.nameClassName} title={member.displayNameTitle}>
                {member.displayName}
              </strong>
              <span className={`member-card__role-chip member-card__role-chip--${member.role}`}>{t(`roles.${member.role}`)}</span>
              <span className={`member-card__status-badge member-card__status-badge--${member.status}`}>
                {t(`agentStatus.${member.status}`)}
              </span>
            </div>
            <p className="member-workbench__task-line" title={taskLabel}>
              <span className="member-workbench__task-kicker">{t('members.taskKicker')}</span>
              {taskLabel}
            </p>
          </div>
        </div>
        <div className="member-workbench__header-actions">
          <button type="button" className="member-card__exec" onClick={onNavigateTerminal}>
            {t('members.fullTerminal')}
          </button>
          <button
            type="button"
            className="member-card__exec"
            onClick={onToggleSkillPanel}
            aria-expanded={skillPanelOpen}
          >
            {skillPanelOpen ? t('members.closeSkills') : t('members.manageSkills')}
          </button>
        </div>
      </div>

      <div className="member-workbench__grid" aria-label={t('members.agentRuntimeAria')}>
        <section className="member-workbench__cell" aria-labelledby={`skills-${member.memberId}`}>
          <h3 className="member-workbench__cell-title" id={`skills-${member.memberId}`}>
            {t('members.cellSkills')}
          </h3>
          <MemberSkillChips memberId={member.memberId} />
        </section>

        <section className="member-workbench__cell" aria-labelledby={`node-${member.memberId}`}>
          <h3 className="member-workbench__cell-title" id={`node-${member.memberId}`}>
            {t('members.cellNode')}
          </h3>
          {node ? (
            <div className="member-workbench__node">
              <span className={nodeStatusClass(node.status)} title={`Node ${node.status}`}>
                {node.status}
              </span>
              <span className="member-workbench__node-host" title={node.hostname}>
                {node.hostname}
              </span>
              <button type="button" className="member-workbench__linkish" onClick={onNavigateNodes}>
                {t('members.topologyLink')}
              </button>
            </div>
          ) : (
            <p className="member-workbench__muted">{t('members.nodeUnassigned')}</p>
          )}
        </section>

        <section className="member-workbench__cell" aria-labelledby={`proc-${member.memberId}`}>
          <h3 className="member-workbench__cell-title" id={`proc-${member.memberId}`}>
            {t('members.cellProcess')}
          </h3>
          <p className="member-workbench__process">{member.processSummary}</p>
        </section>

        <section className="member-workbench__cell member-workbench__cell--cli" aria-label="CLI preview">
          <MemberCliPreview terminalId={member.terminalId} lines={cliLines} onOpenSessions={onNavigateTerminal} />
        </section>
      </div>

      {skillPanelOpen ? (
        <div className="member-workbench__skill-drawer">
          <MemberSkillPanel
            memberId={member.memberId}
            memberName={member.displayName}
            availableSkills={availableSkills}
          />
        </div>
      ) : null}
    </article>
  );
};
