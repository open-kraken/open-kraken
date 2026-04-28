import type { CollaborationStatus, RoleType } from './member-read-model';
import { resolveAgentStatus } from '@/shared/status-model';

export type MemberFixture = {
  workspaceId?: string;
  memberId: string;
  displayName?: string;
  avatar?: string;
  avatarUrl?: string;
  roleType?: RoleType;
  terminalStatus?: string;
  terminalId?: string;
  agentInstanceId?: string;
  agentRuntimeState?: string;
  runtimeReady?: boolean;
  nodeId?: string;
  nodeHostname?: string;
  agentPlacementState?: string;
  manualStatus?: string;
  status?: string;
  statusLabel?: string;
  lastUpdatedAt?: string | null;
  /** When no explicit `teams` list exists, members are grouped by this id. */
  teamId?: string;
};

export type TeamGroupFixture = {
  teamId: string;
  name?: string;
  members: MemberFixture[];
};

export type RoadmapTaskFixture = {
  id: string;
  title: string;
  assigneeId?: string | null;
  status?: string;
};

export type MemberCardModel = {
  agentId: string;
  memberId: string;
  /** Canonical PTY stream id used by terminal attach (UI convention: term_<memberId>). */
  terminalId: string;
  workspaceId: string;
  displayName: string;
  displayNameTitle: string;
  avatarLabel: string;
  avatarUrl: string | null;
  role: RoleType;
  roleLabel: string;
  status: CollaborationStatus;
  statusLabel: string;
  activeTask: string | null;
  activeTaskLabel: string;
  lastUpdatedAt: string | null;
  cardClassName: string;
  nameClassName: string;
  taskClassName: string;
  /** PTY + presence line for ops overview (distinct from collaboration status). */
  processSummary: string;
  agentInstanceId: string | null;
  runtimeReady: boolean;
  runtimeState: string | null;
};

export type TeamRosterModel = {
  teamId: string;
  name: string;
  metrics: {
    total: number;
    aiAssistants: number;
    running: number;
    offline: number;
  };
  members: MemberCardModel[];
};

export type MembersPageModel = {
  workspaceId: string;
  realtimeStatus: string;
  metrics: {
    total: number;
    aiAssistants: number;
    running: number;
    offline: number;
  };
  /** One or more teams; each lists agents with roles (skills are loaded in the panel). */
  teams: TeamRosterModel[];
  members: MemberCardModel[];
};

export type MembersEnvelope =
  | { members?: MemberFixture[] | { members?: MemberFixture[] }; [key: string]: unknown }
  | { readOnly?: boolean; members?: { members?: MemberFixture[] }; [key: string]: unknown }
  | MemberFixture[];

export type RoadmapEnvelope =
  | { tasks?: RoadmapTaskFixture[]; [key: string]: unknown }
  | { roadmap?: { tasks?: RoadmapTaskFixture[] }; [key: string]: unknown }
  | RoadmapTaskFixture[];

const ROLE_LABELS: Record<RoleType, string> = {
  owner: 'Owner',
  supervisor: 'Supervisor',
  assistant: 'Assistant',
  member: 'Member'
};

const STATUS_LABELS: Record<CollaborationStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  success: 'Success',
  error: 'Error',
  offline: 'Offline'
};

const initialsFromName = (displayName: string) => {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

const normalizeStatus = (member: MemberFixture): CollaborationStatus => {
  switch (resolveAgentStatus({
    status: member.status,
    manualStatus: member.manualStatus,
    terminalStatus: member.terminalStatus,
    runtimeState: member.agentRuntimeState,
    runtimeReady: member.runtimeReady,
  })) {
    case 'running':
      return 'running';
    case 'error':
      return 'error';
    case 'offline':
      return 'offline';
    default:
      return 'idle';
  }
};

const normalizeRole = (roleType?: string): RoleType => {
  switch (roleType) {
    case 'owner':
    case 'supervisor':
    case 'assistant':
    case 'member':
      return roleType;
    default:
      return 'member';
  }
};

const getActiveTask = (memberId: string, roadmapTasks: RoadmapTaskFixture[]) => {
  const task = roadmapTasks.find((item) => item.assigneeId === memberId && item.status !== 'done');
  return task?.title ?? null;
};

const buildProcessSummary = (member: MemberFixture): string => {
  const parts: string[] = [];
  if (member.terminalStatus) {
    parts.push(`PTY · ${member.terminalStatus}`);
  }
  if (member.agentRuntimeState) {
    parts.push(`runtime · ${member.agentRuntimeState}`);
  }
  if (member.manualStatus) {
    parts.push(`presence · ${member.manualStatus}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No PTY telemetry';
};

export const normalizeMembersEnvelope = (payload: MembersEnvelope): MemberFixture[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.members)) {
    return payload.members;
  }

  if (payload.members && typeof payload.members === 'object' && Array.isArray(payload.members.members)) {
    return payload.members.members;
  }

  return [];
};

const isTeamGroupList = (raw: unknown): raw is TeamGroupFixture[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return false;
  }
  const first = raw[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'teamId' in first &&
    typeof (first as TeamGroupFixture).teamId === 'string' &&
    Array.isArray((first as TeamGroupFixture).members)
  );
};

/**
 * Resolves flat members plus team groupings from API or fixture payloads.
 * - If `teams` is present with nested `members`, that list wins.
 * - Else if any member has `teamId`, members are grouped and optional `teams` metadata (id+name only) supplies labels.
 * - Else a single default team contains everyone.
 */
export const normalizeTeamsAndMembers = (payload: Record<string, unknown>): { members: MemberFixture[]; teamGroups: TeamGroupFixture[] } => {
  if (isTeamGroupList(payload.teams)) {
    const teamGroups = payload.teams.map((t) => ({
      teamId: String(t.teamId),
      name: t.name,
      members: t.members.map((m) => ({ ...m, teamId: m.teamId ?? String(t.teamId) }))
    }));
    const members = teamGroups.flatMap((t) => t.members);
    return { members, teamGroups };
  }

  const members = normalizeMembersEnvelope(payload as MembersEnvelope);
  const withTeam = members.filter((m) => m.teamId);
  if (withTeam.length === 0) {
    return {
      members,
      teamGroups: [
        {
          teamId: 'team_default',
          name: 'Workspace team',
          members
        }
      ]
    };
  }

  const metaRaw = payload.teams;
  const nameById = new Map<string, string>();
  if (Array.isArray(metaRaw)) {
    for (const item of metaRaw) {
      if (typeof item === 'object' && item !== null && 'teamId' in item) {
        const row = item as { teamId: string; name?: string };
        nameById.set(String(row.teamId), row.name ?? String(row.teamId));
      }
    }
  }

  const byTeam = new Map<string, MemberFixture[]>();
  for (const m of members) {
    const tid = m.teamId ?? 'team_default';
    if (!byTeam.has(tid)) {
      byTeam.set(tid, []);
    }
    byTeam.get(tid)!.push(m);
  }

  const teamGroups: TeamGroupFixture[] = Array.from(byTeam.entries()).map(([teamId, ms]) => ({
    teamId,
    name: nameById.get(teamId) ?? (teamId === 'team_default' ? 'Workspace team' : teamId),
    members: ms
  }));

  return { members, teamGroups };
};

export const normalizeRoadmapTasksEnvelope = (payload: RoadmapEnvelope): RoadmapTaskFixture[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if ('tasks' in payload && Array.isArray(payload.tasks)) {
    return payload.tasks;
  }

  const payloadWithRoadmap = payload as { roadmap?: { tasks?: RoadmapTaskFixture[] } };
  if (payloadWithRoadmap.roadmap && typeof payloadWithRoadmap.roadmap === 'object') {
    const roadmap = payloadWithRoadmap.roadmap;
    if (Array.isArray(roadmap.tasks)) {
      return roadmap.tasks;
    }
  }

  return [];
};

const buildMemberCards = (workspaceId: string, members: MemberFixture[], roadmapTasks: RoadmapTaskFixture[]): MemberCardModel[] => {
  return members.map((member) => {
    const displayName = String(member.displayName ?? 'Unknown member');
    const role = normalizeRole(member.roleType);
    const status = normalizeStatus(member);
    const activeTask = getActiveTask(member.memberId, roadmapTasks);

    return {
      agentId: member.memberId,
      memberId: member.memberId,
      terminalId: member.terminalId ?? `term_${member.memberId}`,
      workspaceId: member.workspaceId ?? workspaceId,
      displayName,
      displayNameTitle: displayName,
      avatarLabel: member.avatar ? member.avatar.slice(0, 2).toUpperCase() : initialsFromName(displayName),
      avatarUrl: member.avatarUrl ?? null,
      role,
      roleLabel: ROLE_LABELS[role],
      status,
      statusLabel: member.statusLabel ?? STATUS_LABELS[status],
      activeTask,
      activeTaskLabel: activeTask ?? 'No active task',
      lastUpdatedAt: member.lastUpdatedAt ?? null,
      cardClassName: 'member-card',
      nameClassName: displayName.length > 24 ? 'member-card__name member-card__name--truncate' : 'member-card__name',
      taskClassName: activeTask ? 'member-card__task' : 'member-card__task member-card__task--empty',
      processSummary: buildProcessSummary(member),
      agentInstanceId: member.agentInstanceId ?? null,
      runtimeReady: member.runtimeReady === true,
      runtimeState: member.agentRuntimeState ?? null
    } satisfies MemberCardModel;
  });
};

const rosterMetrics = (cards: MemberCardModel[]) => ({
  total: cards.length,
  aiAssistants: cards.filter((m) => m.role === 'assistant').length,
  running: cards.filter((m) => m.status === 'running').length,
  offline: cards.filter((m) => m.status === 'offline').length
});

export const buildMembersPageModel = ({
  workspaceId,
  realtimeStatus,
  members,
  roadmapTasks,
  teamGroups
}: {
  workspaceId: string;
  realtimeStatus: string;
  members: MemberFixture[];
  roadmapTasks: RoadmapTaskFixture[];
  teamGroups?: TeamGroupFixture[];
}): MembersPageModel => {
  const groups = teamGroups?.length
    ? teamGroups
    : [{ teamId: 'team_default', name: 'Workspace team', members }];

  const teams: TeamRosterModel[] = groups.map((g) => {
    const cards = buildMemberCards(workspaceId, g.members, roadmapTasks);
    return {
      teamId: g.teamId,
      name: g.name ?? g.teamId,
      metrics: rosterMetrics(cards),
      members: cards
    };
  });

  const cards = buildMemberCards(workspaceId, members, roadmapTasks);

  return {
    workspaceId,
    realtimeStatus,
    metrics: rosterMetrics(cards),
    teams,
    members: cards
  };
};
