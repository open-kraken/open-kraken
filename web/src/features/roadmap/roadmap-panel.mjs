export const buildRoadmapPanelView = ({ roadmap }) => ({
  objective: roadmap.objective,
  tasks: roadmap.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    assigneeId: task.assigneeId ?? null
  }))
});

export const renderRoadmapPanel = (view) => {
  const lines = [`RoadmapPanel:${view.objective}`];
  for (const task of view.tasks) {
    lines.push(`task:${task.id}:${task.status}:${task.assigneeId ?? 'unassigned'}:${task.title}`);
  }
  return lines.join('\n');
};
