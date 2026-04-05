import { useEffect, useState } from 'react';
import membersFixture from '../../../../backend/tests/fixtures/workspace-fixture.json';
import { MemberCollabPanel } from '@/features/members/MemberCollabPanel';
import {
  buildMembersPageModel,
  type MemberFixture,
  type MembersPageModel,
  normalizeMembersEnvelope,
  normalizeRoadmapTasksEnvelope,
  type RoadmapTaskFixture
} from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { getSkills } from '@/api/skills';
import type { Skill } from '@/types/skill';

type MembersPageDataState = {
  model: MembersPageModel;
  source: 'fixture' | 'api';
};

const fallbackMembers = membersFixture.members.members as MemberFixture[];
const fallbackRoadmapTasks = membersFixture.roadmap.tasks as RoadmapTaskFixture[];

const buildFallbackModel = (workspaceId: string, realtimeStatus: string) =>
  buildMembersPageModel({
    workspaceId,
    realtimeStatus,
    members: fallbackMembers,
    roadmapTasks: fallbackRoadmapTasks
  });

export const MembersPage = () => {
  const { workspace, realtime, apiClient } = useAppShell();
  const [state, setState] = useState<MembersPageDataState>(() => ({
    model: buildFallbackModel(workspace.workspaceId, realtime.status),
    source: 'fixture'
  }));
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
        setState({
          model: buildMembersPageModel({
            workspaceId: workspace.workspaceId,
            realtimeStatus: realtime.status,
            members: normalizeMembersEnvelope(membersResponse),
            roadmapTasks: normalizeRoadmapTasksEnvelope(roadmapResponse)
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

  return (
    <section className="page-card page-card--members" data-page-entry="members-runtime" data-members-source={state.source}>
      <MemberCollabPanel model={state.model} availableSkills={availableSkills} />
    </section>
  );
};
