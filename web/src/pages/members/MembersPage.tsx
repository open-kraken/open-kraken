import { useEffect, useState } from 'react';
import { MemberCollabPanel } from '@/features/members/MemberCollabPanel';
import {
  buildMembersPageModel,
  type MembersPageModel,
  normalizeRoadmapTasksEnvelope,
  normalizeTeamsAndMembers,
} from '@/features/members/member-page-model';
import { useAppShell } from '@/state/app-shell-store';
import { getSkills } from '@/api/skills';
import { getNodes } from '@/api/nodes';
import { buildNodeBindingByMemberId } from '@/features/members/member-runtime-map';
import type { Skill } from '@/types/skill';
import type { MemberNodeBinding } from '@/features/members/member-runtime-map';

const emptyModel: MembersPageModel = {
  workspaceId: '',
  realtimeStatus: 'idle',
  metrics: { total: 0, running: 0, offline: 0 },
  teams: [],
  members: []
};

export const MembersPage = () => {
  const { workspace, realtime, apiClient } = useAppShell();
  const [model, setModel] = useState<MembersPageModel>(emptyModel);
  const [nodeByMemberId, setNodeByMemberId] = useState<Record<string, MemberNodeBinding>>({});
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [membersResponse, roadmapResponse] = await Promise.all([apiClient.getMembers(), apiClient.getRoadmap()]);
      if (cancelled) {
        return;
      }
      const { members, teamGroups } = normalizeTeamsAndMembers(membersResponse as Record<string, unknown>);
      setModel(
        buildMembersPageModel({
          workspaceId: workspace.workspaceId,
          realtimeStatus: realtime.status,
          members,
          roadmapTasks: normalizeRoadmapTasksEnvelope(roadmapResponse),
          teamGroups
        })
      );
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [apiClient, realtime.status, workspace.workspaceId]);

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

  return (
    <section className="page-card page-card--members" data-page-entry="members-runtime">
      <MemberCollabPanel
        model={model}
        availableSkills={availableSkills}
        nodeByMemberId={nodeByMemberId}
        cliPreviewByMemberId={{}}
      />
    </section>
  );
};
