export const MEMBER_PANEL_DESKTOP_MIN_WIDTH = 960;

const STATUS_META = {
  idle: { label: 'Idle', tone: 'neutral' },
  running: { label: 'Running', tone: 'running' },
  success: { label: 'Success', tone: 'success' },
  error: { label: 'Error', tone: 'error' },
  offline: { label: 'Offline', tone: 'offline' }
};

const ROLE_META = {
  owner: { label: 'Owner', accent: 'owner' },
  supervisor: { label: 'Supervisor', accent: 'supervisor' },
  assistant: { label: 'Assistant', accent: 'assistant' },
  member: { label: 'Member', accent: 'member' }
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const initialsFromName = (displayName) => {
  const parts = String(displayName ?? '')
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

const normalizeStatus = (member) => {
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

const normalizeRole = (roleType) => ROLE_META[roleType] ?? ROLE_META.member;

const normalizeAvatar = (member) => {
  if (member.avatarUrl) {
    return { kind: 'image', value: member.avatarUrl };
  }
  if (member.avatar) {
    return { kind: 'text', value: String(member.avatar).slice(0, 2).toUpperCase() };
  }
  return { kind: 'text', value: initialsFromName(member.displayName) };
};

const normalizeActiveTask = (member) => {
  if (member.activeTask && String(member.activeTask).trim()) {
    return String(member.activeTask).trim();
  }
  return null;
};

export const buildMemberPanelView = ({ workspaceId, members, viewportWidth = 1280 }) => {
  const layout = viewportWidth >= MEMBER_PANEL_DESKTOP_MIN_WIDTH ? 'desktop' : 'mobile';
  return {
    workspaceId,
    layout,
    layoutClass: `member-collab-panel--${layout}`,
    desktopMinWidth: MEMBER_PANEL_DESKTOP_MIN_WIDTH,
    members: members.map((member) => {
      const status = normalizeStatus(member);
      const statusMeta = STATUS_META[status];
      const roleMeta = normalizeRole(member.roleType);
      const avatar = normalizeAvatar(member);
      const activeTask = normalizeActiveTask(member);
      const displayName = String(member.displayName ?? 'Unknown member');
      return {
        agentId: member.agentId ?? member.memberId,
        memberId: member.memberId ?? member.agentId,
        workspaceId: member.workspaceId ?? workspaceId,
        displayName,
        displayNameTitle: displayName,
        role: member.roleType ?? 'member',
        roleLabel: roleMeta.label,
        roleAccent: roleMeta.accent,
        avatar,
        status,
        statusLabel: member.statusLabel ?? statusMeta.label,
        statusTone: statusMeta.tone,
        activeTask,
        activeTaskLabel: activeTask ?? 'No active task',
        lastUpdatedAt: member.lastUpdatedAt ?? null,
        classes: {
          card: 'member-card',
          task: activeTask ? 'member-card__task' : 'member-card__task member-card__task--empty',
          name: displayName.length > 24 ? 'member-card__name member-card__name--truncate' : 'member-card__name'
        }
      };
    })
  };
};

export const renderMemberPanel = (view) => {
  const cards = view.members
    .map((member) => {
      const avatarMarkup =
        member.avatar.kind === 'image'
          ? `<img class="member-card__avatar-image" src="${escapeHtml(member.avatar.value)}" alt="${escapeHtml(member.displayName)} avatar" />`
          : `<span class="member-card__avatar-fallback">${escapeHtml(member.avatar.value)}</span>`;

      return `<article class="${escapeHtml(member.classes.card)}" data-member-id="${escapeHtml(member.memberId)}" data-role="${escapeHtml(member.role)}" data-status="${escapeHtml(member.status)}">
  <div class="member-card__identity">
    <div class="member-card__avatar member-card__avatar--${escapeHtml(member.roleAccent)}">${avatarMarkup}</div>
    <div class="member-card__meta">
      <strong class="${escapeHtml(member.classes.name)}" title="${escapeHtml(member.displayNameTitle)}">${escapeHtml(member.displayName)}</strong>
      <div class="member-card__supporting">
        <span class="member-card__role-chip member-card__role-chip--${escapeHtml(member.roleAccent)}">${escapeHtml(member.roleLabel)}</span>
        <span class="member-card__status-badge member-card__status-badge--${escapeHtml(member.statusTone)}">${escapeHtml(member.statusLabel)}</span>
      </div>
    </div>
  </div>
  <div class="${escapeHtml(member.classes.task)}" title="${escapeHtml(member.activeTaskLabel)}">
    <span class="member-card__task-label">Active task</span>
    <span class="member-card__task-value">${escapeHtml(member.activeTaskLabel)}</span>
  </div>
</article>`;
    })
    .join('\n');

  return `MembersPanel:${view.workspaceId}
layout=${view.layout}
desktopMinWidth=${view.desktopMinWidth}
<section class="member-collab-panel ${escapeHtml(view.layoutClass)}" data-layout="${escapeHtml(view.layout)}">
${cards}
</section>`;
};
