type RoadmapTask = {
  id: string;
  title: string;
  status: string;
  assigneeId?: string | null;
};

type RoadmapInput = {
  roadmap: {
    objective: string;
    tasks: RoadmapTask[];
  };
};

type RoadmapTaskView = {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
};

export type RoadmapPanelView = {
  objective: string;
  tasks: RoadmapTaskView[];
};

export const buildRoadmapPanelView = ({ roadmap }: RoadmapInput): RoadmapPanelView => ({
  objective: roadmap.objective,
  tasks: roadmap.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    assigneeId: task.assigneeId ?? null
  }))
});

export const renderRoadmapPanel = (view: RoadmapPanelView): string => {
  const lines = [`RoadmapPanel:${view.objective}`];
  for (const task of view.tasks) {
    lines.push(`task:${task.id}:${task.status}:${task.assigneeId ?? 'unassigned'}:${task.title}`);
  }
  return lines.join('\n');
};
