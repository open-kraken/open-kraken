import type { CollaborationStatus, RoleType } from './member-read-model';

export type MemberFixture = {
  workspaceId?: string;
  memberId: string;
  displayName?: string;
  avatar?: string;
  avatarUrl?: string;
  roleType?: RoleType;
  terminalStatus?: string;
  manualStatus?: string;
  status?: string;
  statusLabel?: string;
  lastUpdatedAt?: string | null;
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
};

export type MembersPageModel = {
  workspaceId: string;
  realtimeStatus: string;
  metrics: {
    total: number;
    running: number;
    offline: number;
  };
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
  const raw = String(member.status ?? member.terminalStatus ?? '').toLowerCase();
  switch (raw) {
    case 'running':
    case 'working':
    case 'busy':
    case 'in_progress':
      return 'running';
    case 'success':
    case 'done':
    case 'completed':
    case 'exited':
      return 'success';
    case 'error':
    case 'failed':
      return 'error';
    case 'offline':
      return 'offline';
    case 'idle':
    case 'attached':
    case 'online':
      return 'idle';
    default:
      return String(member.manualStatus ?? '').toLowerCase() === 'offline' ? 'offline' : 'idle';
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

export const buildMembersPageModel = ({
  workspaceId,
  realtimeStatus,
  members,
  roadmapTasks
}: {
  workspaceId: string;
  realtimeStatus: string;
  members: MemberFixture[];
  roadmapTasks: RoadmapTaskFixture[];
}): MembersPageModel => {
  const cards = members.map((member) => {
    const displayName = String(member.displayName ?? 'Unknown member');
    const role = normalizeRole(member.roleType);
    const status = normalizeStatus(member);
    const activeTask = getActiveTask(member.memberId, roadmapTasks);

    return {
      agentId: member.memberId,
      memberId: member.memberId,
      terminalId: `term_${member.memberId}`,
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
      taskClassName: activeTask ? 'member-card__task' : 'member-card__task member-card__task--empty'
    } satisfies MemberCardModel;
  });

  return {
    workspaceId,
    realtimeStatus,
    metrics: {
      total: cards.length,
      running: cards.filter((member) => member.status === 'running').length,
      offline: cards.filter((member) => member.status === 'offline').length
    },
    members: cards
  };
};
