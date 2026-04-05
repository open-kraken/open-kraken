import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMBER_PANEL_DESKTOP_MIN_WIDTH,
  buildMemberPanelView,
  renderMemberPanel
} from '../features/members/member-panel.mjs';

test('member panel keeps canonical role rendering and status badges', () => {
  const view = buildMemberPanelView({
    workspaceId: 'ws_open_kraken',
    members: [
      {
        memberId: 'owner_1',
        displayName: 'Claire',
        avatar: 'CL',
        roleType: 'owner',
        status: 'running',
        activeTask: 'Review migration checkpoints'
      },
      {
        memberId: 'supervisor_1',
        displayName: 'Ops Lead',
        avatar: 'OL',
        roleType: 'supervisor',
        status: 'success',
        activeTask: 'Merge release branch'
      },
      {
        memberId: 'assistant_1',
        displayName: 'Planner',
        roleType: 'assistant',
        status: 'idle'
      },
      {
        memberId: 'member_1',
        displayName: 'Runner',
        roleType: 'member',
        status: 'offline'
      }
    ]
  });
  const rendered = renderMemberPanel(view);

  assert.equal(view.members[0].roleLabel, 'Owner');
  assert.equal(view.members[1].roleLabel, 'Supervisor');
  assert.equal(view.members[2].statusLabel, 'Idle');
  assert.equal(view.members[3].statusLabel, 'Offline');
  assert.match(rendered, /member-card__role-chip--owner/);
  assert.match(rendered, /member-card__role-chip--supervisor/);
  assert.match(rendered, /member-card__status-badge--running/);
  assert.match(rendered, /member-card__status-badge--success/);
});

test('member panel switches layout class at the desktop threshold', () => {
  const desktopView = buildMemberPanelView({
    workspaceId: 'ws_open_kraken',
    viewportWidth: MEMBER_PANEL_DESKTOP_MIN_WIDTH,
    members: [{ memberId: 'member_1', displayName: 'Runner', roleType: 'member', status: 'idle' }]
  });
  const mobileView = buildMemberPanelView({
    workspaceId: 'ws_open_kraken',
    viewportWidth: MEMBER_PANEL_DESKTOP_MIN_WIDTH - 1,
    members: [{ memberId: 'member_1', displayName: 'Runner', roleType: 'member', status: 'idle' }]
  });

  assert.equal(desktopView.layout, 'desktop');
  assert.equal(mobileView.layout, 'mobile');
  assert.match(renderMemberPanel(desktopView), /class="member-collab-panel member-collab-panel--desktop"/);
  assert.match(renderMemberPanel(mobileView), /class="member-collab-panel member-collab-panel--mobile"/);
});

test('member panel falls back for missing avatar, missing task, and long names without breaking layout metadata', () => {
  const displayName = 'Very Long Display Name For Agent Coordination Surface';
  const view = buildMemberPanelView({
    workspaceId: 'ws_open_kraken',
    viewportWidth: 480,
    members: [
      {
        memberId: 'member_2',
        displayName,
        roleType: 'member',
        manualStatus: 'offline'
      }
    ]
  });
  const [member] = view.members;
  const rendered = renderMemberPanel(view);

  assert.equal(member.avatar.kind, 'text');
  assert.equal(member.avatar.value, 'VL');
  assert.equal(member.activeTaskLabel, 'No active task');
  assert.match(member.classes.name, /truncate/);
  assert.match(rendered, /title="Very Long Display Name For Agent Coordination Surface"/);
  assert.match(rendered, /member-card__task member-card__task--empty/);
  assert.match(rendered, /No active task/);
  assert.match(rendered, /data-layout="mobile"/);
});
