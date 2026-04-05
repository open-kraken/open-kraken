import { useEffect, useState } from 'react';
import membersFixture from '../../../../backend/tests/fixtures/workspace-fixture.json';
import { MemberCollabPanel } from '@/features/members/MemberCollabPanel';
import {
  buildMembersPageModel,
  type MembersPageModel,
  normalizeRoadmapTasksEnvelope,
  normalizeTeamsAndMembers,
  type RoadmapTaskFixture
} from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { getSkills } from '@/api/skills';
import { getNodes } from '@/api/nodes';
import { buildNodeBindingByMemberId } from '@/features/members/member-runtime-map';
import { buildCliPreviewLinesFromFixture } from '@/features/members/cli-preview-from-fixture';
import type { Skill } from '@/types/skill';
import type { MemberNodeBinding } from '@/features/members/member-runtime-map';

type MembersPageDataState = {
  model: MembersPageModel;
  source: 'fixture' | 'api';
};

const fixtureCliPreviews = buildCliPreviewLinesFromFixture(
  membersFixture as unknown as { terminalSessions?: Array<Record<string, unknown>> }
);

const fallbackRoadmapTasks = membersFixture.roadmap.tasks as RoadmapTaskFixture[];

const buildFallbackModel = (workspaceId: string, realtimeStatus: string) => {
  const { members, teamGroups } = normalizeTeamsAndMembers(membersFixture as Record<string, unknown>);
  return buildMembersPageModel({
    workspaceId,
    realtimeStatus,
    members,
    roadmapTasks: fallbackRoadmapTasks,
    teamGroups
  });
};

export const MembersPage = () => {
  const { workspace, realtime, apiClient } = useAppShell();
  const [state, setState] = useState<MembersPageDataState>(() => ({
    model: buildFallbackModel(workspace.workspaceId, realtime.status),
    source: 'fixture'
  }));
  const [nodeByMemberId, setNodeByMemberId] = useState<Record<string, MemberNodeBinding>>({});
  // Available skills for the inline MemberSkillPanel integration
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [membersResponse, roadmapResponse] = await Promise.all([apiClient.getMembers(), apiClient.getRoadmap()]);
        if (cancelled) {
          return;
        }
        const { members, teamGroups } = normalizeTeamsAndMembers(membersResponse as Record<string, unknown>);
        setState({
          model: buildMembersPageModel({
            workspaceId: workspace.workspaceId,
            realtimeStatus: realtime.status,
            members,
            roadmapTasks: normalizeRoadmapTasksEnvelope(roadmapResponse),
            teamGroups
          }),
          source: 'api'
        });
      } catch {
        if (cancelled) {
          return;
        }
        setState({
          model: buildFallbackModel(workspace.workspaceId, realtime.status),
          source: 'fixture'
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [apiClient, realtime.status, workspace.workspaceId]);

  // Load available skills once on mount for the skill panel integration
  useEffect(() => {
    void getSkills().then((res) => setAvailableSkills(res.skills));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { nodes } = await getNodes();
        if (!cancelled) {
          setNodeByMemberId(buildNodeBindingByMemberId(nodes));
        }
      } catch {
        /* optional topology */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cliPreviewForUi = state.source === 'fixture' ? fixtureCliPreviews : {};

  return (
    <section className="page-card page-card--members" data-page-entry="members-runtime" data-members-source={state.source}>
      <MemberCollabPanel
        model={state.model}
        availableSkills={availableSkills}
        nodeByMemberId={nodeByMemberId}
        cliPreviewByMemberId={cliPreviewForUi}
      />
    </section>
  );
};
