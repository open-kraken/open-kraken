import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { TeamMemberWorkbenchCard } from '@/features/members/TeamMemberWorkbenchCard';
import type { Skill } from '@/types/skill';
import type { MembersPageModel } from './member-page-model';
import type { MemberNodeBinding } from '@/features/members/member-runtime-map';

export type MemberCollabPanelProps = {
  model: MembersPageModel;
  /** Skill catalogue for the management drawer. */
  availableSkills?: Skill[];
  /** From GET /nodes — which execution node hosts each member. */
  nodeByMemberId?: Record<string, MemberNodeBinding>;
  /** Optional PTY snapshot lines per member (fixture or future API). */
  cliPreviewByMemberId?: Record<string, string[]>;
};

export const MemberCollabPanel = ({
  model,
  availableSkills = [],
  nodeByMemberId = {},
  cliPreviewByMemberId = {}
}: MemberCollabPanelProps) => {
  const { t } = useI18n();
  const { navigate } = useAppShell();
  const teams = model.teams.length > 0 ? model.teams : [];
  const [activeTeamId, setActiveTeamId] = useState<string>(() => teams[0]?.teamId ?? 'team_default');
  const [skillPanelMemberId, setSkillPanelMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!teams.some((t) => t.teamId === activeTeamId) && teams[0]) {
      setActiveTeamId(teams[0].teamId);
    }
  }, [teams, activeTeamId]);

  const activeTeam = useMemo(
    () => teams.find((t) => t.teamId === activeTeamId) ?? teams[0],
    [teams, activeTeamId]
  );

  const rosterMembers = activeTeam?.members ?? model.members;
  const rosterMetrics = activeTeam?.metrics ?? model.metrics;

  return (
    <section
      className="members-page members-page--workbench"
      data-route-page="members"
      data-realtime-status={model.realtimeStatus}
    >
      <div className="route-page__hero">
        <div>
          <p className="page-eyebrow">{t('members.teamEyebrow')}</p>
          <h1>{t('members.workbenchTitle')}</h1>
          <p className="route-page__intro">{t('members.workbenchIntro')}</p>
        </div>
        <div className="route-page__metric-strip members-page__metrics" aria-label={t('members.metricsAria')}>
          <div className="route-page__metric members-page__metric">
            <span className="route-page__metric-label members-page__metric-label">{t('members.metric.teams')}</span>
            <strong>{teams.length}</strong>
            <small>{t('members.metric.teamsHint')}</small>
          </div>
          <div className="route-page__metric members-page__metric">
            <span className="route-page__metric-label members-page__metric-label">{t('members.metric.agents')}</span>
            <strong>{rosterMetrics.total}</strong>
            <small>
              {activeTeam
                ? t('members.workbenchRosterTitle', {
                    name: activeTeam.name === 'Workspace team' ? t('members.defaultTeamName') : activeTeam.name
                  })
                : t('members.metric.agentsHintAll')}
            </small>
          </div>
          <div className="route-page__metric members-page__metric">
            <span className="route-page__metric-label members-page__metric-label">{t('members.metric.running')}</span>
            <strong>{rosterMetrics.running}</strong>
            <small>{t('members.metric.runningHint')}</small>
          </div>
          <div className="route-page__metric members-page__metric">
            <span className="route-page__metric-label members-page__metric-label">{t('members.metric.offline')}</span>
            <strong>{rosterMetrics.offline}</strong>
            <small>{t('members.offlineHintReconnect')}</small>
          </div>
        </div>
      </div>

      {teams.length > 1 ? (
        <div className="members-page__team-switch" role="tablist" aria-label={t('members.teamTabsAria')}>
          {teams.map((team) => (
            <button
              key={team.teamId}
              type="button"
              role="tab"
              aria-selected={team.teamId === activeTeamId}
              className={
                team.teamId === activeTeamId
                  ? 'members-page__team-tab members-page__team-tab--active'
                  : 'members-page__team-tab'
              }
              onClick={() => setActiveTeamId(team.teamId)}
            >
              <span className="members-page__team-name">
                {team.name === 'Workspace team' ? t('members.defaultTeamName') : team.name}
              </span>
              <span className="members-page__team-count">{t('members.agentsCount', { count: team.metrics.total })}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="members-page__context-bar">
        <dl className="members-page__context-kv">
          <div>
            <dt>{t('members.contextShellRealtime')}</dt>
            <dd>{model.realtimeStatus}</dd>
          </div>
          <div>
            <dt>{t('members.contextActiveTeam')}</dt>
            <dd>{activeTeam?.name ?? t('system.emDash')}</dd>
          </div>
        </dl>
        <span className="route-page__status-pill route-page__status-pill--live">{t('members.liveWorkspace')}</span>
      </div>

      <div className="route-page__grid route-page__grid--members-workbench">
        <section className="route-page__panel members-page__panel members-page__panel--roster">
          <header className="route-page__panel-header">
            <div>
              <p className="page-eyebrow">{t('members.agentsEyebrow')}</p>
              <h2>
                {activeTeam
                  ? t('members.workbenchRosterTitle', {
                      name: activeTeam.name === 'Workspace team' ? t('members.defaultTeamName') : activeTeam.name
                    })
                  : t('members.workspaceAgents')}
              </h2>
            </div>
            <span className="route-page__status-pill">{t('members.workbenchPill')}</span>
          </header>

          <div className="members-workbench-list" aria-label={t('members.teamAgentsAria')}>
            {rosterMembers.map((member) => (
              <TeamMemberWorkbenchCard
                key={member.memberId}
                member={member}
                node={nodeByMemberId[member.memberId] ?? null}
                cliLines={cliPreviewByMemberId[member.memberId] ?? []}
                availableSkills={availableSkills}
                skillPanelOpen={skillPanelMemberId === member.memberId}
                onToggleSkillPanel={() =>
                  setSkillPanelMemberId((prev) => (prev === member.memberId ? null : member.memberId))
                }
                onNavigateTerminal={() => navigate('terminal', { hash: member.terminalId })}
                onNavigateNodes={() => navigate('nodes')}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
};
