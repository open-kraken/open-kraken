import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMembersPageModel,
  normalizeMembersEnvelope,
  normalizeRoadmapTasksEnvelope
} from '@/features/members/member-page-model';

test('member page model normalizes wrapped members and roadmap envelopes from browser runtime clients', () => {
  const members = normalizeMembersEnvelope({
    readOnly: false,
    members: {
      members: [
        {
          workspaceId: 'ws_open_kraken',
          memberId: 'assistant_1',
          displayName: 'Planner',
          roleType: 'assistant',
          terminalStatus: 'online'
        }
      ]
    }
  });
  const roadmapTasks = normalizeRoadmapTasksEnvelope({
    readOnly: false,
    storage: 'workspace',
    warning: '',
    roadmap: {
      objective: 'Ship',
      tasks: [{ id: 'task_1', title: 'Close remaining runtime gaps', assigneeId: 'assistant_1', status: 'in_progress' }]
    }
  });
  const model = buildMembersPageModel({
    workspaceId: 'ws_open_kraken',
    realtimeStatus: 'connected',
    members,
    roadmapTasks
  });

  assert.equal(members.length, 1);
  assert.equal(roadmapTasks.length, 1);
  assert.equal(model.members[0].status, 'idle');
  assert.equal(model.members[0].activeTaskLabel, 'Close remaining runtime gaps');
  assert.equal(model.metrics.total, 1);
  assert.equal(model.metrics.aiAssistants, 1);
  assert.equal(model.teams.length, 1);
  assert.equal(model.teams[0].members.length, model.members.length);
  assert.equal(model.teams[0].metrics.aiAssistants, 1);
});

test('member page model counts AI assistants per team separately from total members', () => {
  const model = buildMembersPageModel({
    workspaceId: 'ws_open_kraken',
    realtimeStatus: 'connected',
    members: [
      { memberId: 'owner_1', displayName: 'Owner', roleType: 'owner', teamId: 'team_a' },
      { memberId: 'assistant_1', displayName: 'Planner', roleType: 'assistant', teamId: 'team_a' },
      { memberId: 'assistant_2', displayName: 'Runner', roleType: 'assistant', teamId: 'team_b' }
    ],
    roadmapTasks: [],
    teamGroups: [
      {
        teamId: 'team_a',
        name: 'Team A',
        members: [
          { memberId: 'owner_1', displayName: 'Owner', roleType: 'owner' },
          { memberId: 'assistant_1', displayName: 'Planner', roleType: 'assistant' }
        ]
      },
      {
        teamId: 'team_b',
        name: 'Team B',
        members: [{ memberId: 'assistant_2', displayName: 'Runner', roleType: 'assistant' }]
      }
    ]
  });

  assert.equal(model.metrics.total, 3);
  assert.equal(model.metrics.aiAssistants, 2);
  assert.equal(model.teams[0].metrics.total, 2);
  assert.equal(model.teams[0].metrics.aiAssistants, 1);
  assert.equal(model.teams[1].metrics.aiAssistants, 1);
});
