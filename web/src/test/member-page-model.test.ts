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
});
