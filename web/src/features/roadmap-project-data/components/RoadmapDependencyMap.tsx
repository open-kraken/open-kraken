import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { RoadmapTaskItem, RoadmapTaskStatus } from '../api-client';
import styles from '../roadmap-feature.module.css';

const COLUMNS: RoadmapTaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];
const STATUS_OPTIONS: RoadmapTaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];
const COLUMN_WIDTH = 260;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;
const ROW_HEIGHT = 126;
const HEADER_HEIGHT = 54;
const GUTTER = 24;

type PositionedTask = {
  task: RoadmapTaskItem;
  x: number;
  y: number;
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

const toDateInputValue = (iso: string | null | undefined) => iso?.split('T')[0] ?? '';

const fromDateInputValue = (value: string) => value ? new Date(value).toISOString() : null;

const buildStatusPatch = (status: RoadmapTaskStatus, task: RoadmapTaskItem): Partial<RoadmapTaskItem> => {
  const patch: Partial<RoadmapTaskItem> = { status };
  if (status === 'in_progress' && !task.startedAt) {
    patch.startedAt = new Date().toISOString();
  }
  if (status === 'done' && !task.completedAt) {
    patch.completedAt = new Date().toISOString();
  }
  return patch;
};

const hasDependencyPath = (
  fromTaskId: string,
  targetTaskId: string,
  taskById: Map<string, RoadmapTaskItem>,
  seen = new Set<string>(),
): boolean => {
  if (fromTaskId === targetTaskId) return true;
  if (seen.has(fromTaskId)) return false;
  seen.add(fromTaskId);
  const fromTask = taskById.get(fromTaskId);
  return (fromTask?.dependencies ?? []).some((depId) => hasDependencyPath(depId, targetTaskId, taskById, seen));
};

export type RoadmapDependencyMapProps = {
  tasks: RoadmapTaskItem[];
  allTasks: RoadmapTaskItem[];
  members: Array<{ memberId: string; displayName?: string }>;
  disableInputs: boolean;
  onTaskChange: (taskId: string, patch: Partial<RoadmapTaskItem>) => void;
};

export const RoadmapDependencyMap = ({
  tasks,
  allTasks,
  members,
  disableInputs,
  onTaskChange,
}: RoadmapDependencyMapProps) => {
  const { t } = useI18n();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.memberId, member.displayName ?? member.memberId])),
    [members],
  );
  const allTaskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks]);

  useEffect(() => {
    if (selectedTaskId && tasks.some((task) => task.id === selectedTaskId)) return;
    setSelectedTaskId(tasks[0]?.id ?? null);
  }, [selectedTaskId, tasks]);

  const layout = useMemo(() => {
    const grouped = new Map<RoadmapTaskStatus, RoadmapTaskItem[]>(COLUMNS.map((status) => [status, []]));
    for (const task of tasks) {
      const status = COLUMNS.includes(task.status as RoadmapTaskStatus) ? task.status : 'todo';
      grouped.get(status)?.push(task);
    }

    const positioned = new Map<string, PositionedTask>();
    for (const [columnIndex, status] of COLUMNS.entries()) {
      const columnTasks = grouped.get(status) ?? [];
      columnTasks.forEach((task, rowIndex) => {
        positioned.set(task.id, {
          task,
          x: GUTTER + columnIndex * COLUMN_WIDTH,
          y: HEADER_HEIGHT + rowIndex * ROW_HEIGHT,
        });
      });
    }

    const maxRows = Math.max(1, ...Array.from(grouped.values(), (items) => items.length));
    return {
      grouped,
      positioned,
      width: GUTTER * 2 + COLUMNS.length * COLUMN_WIDTH,
      height: HEADER_HEIGHT + maxRows * ROW_HEIGHT + GUTTER,
    };
  }, [tasks]);

  const connectors = useMemo(() => {
    const lines: Array<{ id: string; path: string; blocked: boolean; active: boolean }> = [];
    for (const target of tasks) {
      const targetPosition = layout.positioned.get(target.id);
      if (!targetPosition) continue;
      for (const depId of target.dependencies ?? []) {
        const sourcePosition = layout.positioned.get(depId);
        const sourceTask = allTaskById.get(depId);
        if (!sourcePosition || !sourceTask) continue;
        const startX = sourcePosition.x + NODE_WIDTH;
        const startY = sourcePosition.y + 34;
        const endX = targetPosition.x;
        const endY = targetPosition.y + 34;
        const curve = Math.max(44, Math.abs(endX - startX) / 2);
        const path = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
        lines.push({
          id: `${depId}-${target.id}`,
          path,
          blocked: sourceTask.status !== 'done',
          active: target.id === selectedTaskId || depId === selectedTaskId,
        });
      }
    }
    return lines;
  }, [allTaskById, layout.positioned, selectedTaskId, tasks]);

  const selectedTask = selectedTaskId ? allTaskById.get(selectedTaskId) ?? null : null;
  const blockedConnectorCount = connectors.filter((line) => line.blocked).length;
  const dependencyOptions = useMemo(() => {
    if (!selectedTask) return [];
    return allTasks
      .filter((task) => task.id !== selectedTask.id)
      .map((task) => ({
        task,
        createsCycle: hasDependencyPath(task.id, selectedTask.id, allTaskById),
      }));
  }, [allTaskById, allTasks, selectedTask]);

  return (
    <div className={styles['roadmap-map']} aria-label={t('roadmapPanel.viewMap')}>
      <div className={styles['roadmap-map__viewport']}>
        <div className={styles['roadmap-map__legend']}>
          <span><i data-kind="ready" />{t('roadmapPanel.readyDependency')}</span>
          <span><i data-kind="blocked" />{t('roadmapPanel.blockedDependency')}</span>
          <strong>{t('roadmapPanel.connectionSummary', { total: connectors.length, blocked: blockedConnectorCount })}</strong>
        </div>
        <div
          className={styles['roadmap-map__canvas']}
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className={styles['roadmap-map__svg']}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            <defs>
              <marker id="roadmap-map-arrow-ready" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" />
              </marker>
              <marker id="roadmap-map-arrow-blocked" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" />
              </marker>
            </defs>
            {connectors.map((line) => (
              <path
                key={line.id}
                className={styles['roadmap-map__connector']}
                data-blocked={line.blocked ? 'true' : 'false'}
                data-active={line.active ? 'true' : 'false'}
                d={line.path}
                markerEnd={line.blocked ? 'url(#roadmap-map-arrow-blocked)' : 'url(#roadmap-map-arrow-ready)'}
              />
            ))}
          </svg>

          {COLUMNS.map((status, columnIndex) => (
            <div
              key={status}
              className={styles['roadmap-map__lane-header']}
              style={{ left: GUTTER + columnIndex * COLUMN_WIDTH, top: 0, width: NODE_WIDTH }}
            >
              <span className={styles['roadmap-task-card__status-dot']} data-status={status} />
              <span>{t(`taskStatus.${status}`)}</span>
              <strong>{layout.grouped.get(status)?.length ?? 0}</strong>
            </div>
          ))}

          {Array.from(layout.positioned.values()).map(({ task, x, y }) => {
            const dependencyTitles = (task.dependencies ?? [])
              .map((depId) => allTaskById.get(depId))
              .filter((dep): dep is RoadmapTaskItem => Boolean(dep))
              .map((dep) => `#${dep.number} ${dep.title || t('roadmapPanel.taskTitle')}`);
            const hasBlockedDependency = (task.dependencies ?? [])
              .some((depId) => allTaskById.get(depId)?.status !== 'done');
            const assigneeName = task.assigneeId
              ? memberNames.get(task.assigneeId) ?? task.assigneeId
              : t('roadmapPanel.unassigned');
            const dueDate = formatDate(task.dueAt);

            return (
              <article
                key={task.id}
                className={styles['roadmap-map__node']}
                data-status={task.status}
                data-blocked-dependency={hasBlockedDependency ? 'true' : 'false'}
                data-selected={selectedTaskId === task.id ? 'true' : 'false'}
                style={{ left: x, top: y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                onClick={() => setSelectedTaskId(task.id)}
                onFocus={() => setSelectedTaskId(task.id)}
                tabIndex={0}
              >
                <div className={styles['roadmap-map__node-header']}>
                  <span>#{task.number}</span>
                  <select
                    value={task.status}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onTaskChange(task.id, buildStatusPatch(event.currentTarget.value, task))}
                    disabled={disableInputs}
                    aria-label={t('roadmapPanel.taskStatus')}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{t(`taskStatus.${status}`)}</option>
                    ))}
                  </select>
                </div>
                <div className={styles['roadmap-map__node-title']}>{task.title || t('roadmapPanel.taskTitle')}</div>
                <div className={styles['roadmap-map__node-meta']}>
                  <span>{assigneeName}</span>
                  {dueDate ? <span>{dueDate}</span> : null}
                </div>
                {dependencyTitles.length > 0 ? (
                  <div className={styles['roadmap-map__node-deps']} title={dependencyTitles.join(', ')}>
                    {t('roadmapPanel.dependsCount', { count: dependencyTitles.length })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <aside className={styles['roadmap-map__inspector']} aria-label={t('roadmapPanel.inspectorTitle')}>
        {selectedTask ? (
          <>
            <div className={styles['roadmap-map__inspector-header']}>
              <span>{t('roadmapPanel.inspectorTitle')}</span>
              <strong>#{selectedTask.number}</strong>
            </div>
            <label className={styles['roadmap-map__inspector-field']}>
              <span>{t('roadmapPanel.taskTitle')}</span>
              <input
                type="text"
                value={selectedTask.title}
                onChange={(event) => onTaskChange(selectedTask.id, { title: event.currentTarget.value })}
                disabled={disableInputs}
              />
            </label>
            <div className={styles['roadmap-map__inspector-grid']}>
              <label className={styles['roadmap-map__inspector-field']}>
                <span>{t('roadmapPanel.taskStatus')}</span>
                <select
                  value={selectedTask.status}
                  onChange={(event) => onTaskChange(selectedTask.id, buildStatusPatch(event.currentTarget.value, selectedTask))}
                  disabled={disableInputs}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{t(`taskStatus.${status}`)}</option>
                  ))}
                </select>
              </label>
              <label className={styles['roadmap-map__inspector-field']}>
                <span>{t('roadmapPanel.assignee')}</span>
                <select
                  value={selectedTask.assigneeId ?? ''}
                  onChange={(event) => onTaskChange(selectedTask.id, { assigneeId: event.currentTarget.value || null })}
                  disabled={disableInputs}
                >
                  <option value="">{t('roadmapPanel.unassigned')}</option>
                  {members.map((member) => (
                    <option key={member.memberId} value={member.memberId}>
                      {member.displayName ?? member.memberId}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles['roadmap-map__inspector-grid']}>
              <label className={styles['roadmap-map__inspector-field']}>
                <span>{t('roadmapPanel.startDate')}</span>
                <input
                  type="date"
                  value={toDateInputValue(selectedTask.startedAt)}
                  onChange={(event) => onTaskChange(selectedTask.id, { startedAt: fromDateInputValue(event.currentTarget.value) })}
                  disabled={disableInputs}
                />
              </label>
              <label className={styles['roadmap-map__inspector-field']}>
                <span>{t('roadmapPanel.dueDate')}</span>
                <input
                  type="date"
                  value={toDateInputValue(selectedTask.dueAt)}
                  onChange={(event) => onTaskChange(selectedTask.id, { dueAt: fromDateInputValue(event.currentTarget.value) })}
                  disabled={disableInputs}
                />
              </label>
            </div>
            <label className={styles['roadmap-map__inspector-field']}>
              <span>{t('roadmapPanel.dependencies')}</span>
              <select
                multiple
                value={selectedTask.dependencies ?? []}
                onChange={(event) => {
                  const selected = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
                  onTaskChange(selectedTask.id, { dependencies: selected });
                }}
                disabled={disableInputs}
                className={styles['roadmap-map__dependency-select']}
              >
                {dependencyOptions.map(({ task, createsCycle }) => (
                  <option key={task.id} value={task.id} disabled={createsCycle}>
                    #{task.number} {task.title || t('roadmapPanel.taskTitle')}{createsCycle ? ` - ${t('roadmapPanel.cycleBlocked')}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles['roadmap-map__inspector-summary']}>
              <span>{t('roadmapPanel.dependsCount', { count: selectedTask.dependencies?.length ?? 0 })}</span>
              <span>{t('roadmapPanel.downstreamCount', {
                count: allTasks.filter((task) => task.dependencies?.includes(selectedTask.id)).length,
              })}</span>
            </div>
          </>
        ) : (
          <p className={styles['roadmap-map__inspector-empty']}>{t('roadmapPanel.selectTask')}</p>
        )}
      </aside>
    </div>
  );
};
