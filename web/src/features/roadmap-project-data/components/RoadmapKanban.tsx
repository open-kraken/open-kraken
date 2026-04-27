import { useMemo } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { RoadmapTaskItem, RoadmapTaskStatus } from '../api-client';
import styles from '../roadmap-feature.module.css';

const COLUMNS: RoadmapTaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];
const STATUS_OPTIONS: RoadmapTaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];

export type RoadmapKanbanProps = {
  tasks: RoadmapTaskItem[];
  members: Array<{ memberId: string; displayName?: string }>;
  disableInputs: boolean;
  onTaskChange: (taskId: string, patch: Partial<RoadmapTaskItem>) => void;
  onDelete: (taskId: string) => void;
};

export const RoadmapKanban = ({ tasks, members, disableInputs, onTaskChange, onDelete }: RoadmapKanbanProps) => {
  const { t } = useI18n();
  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.memberId, member.displayName ?? member.memberId])),
    [members],
  );

  const columns = useMemo(() => {
    const grouped: Record<string, RoadmapTaskItem[]> = {};
    for (const col of COLUMNS) grouped[col] = [];
    for (const task of tasks) {
      const key = COLUMNS.includes(task.status as RoadmapTaskStatus) ? task.status : 'todo';
      grouped[key].push(task);
    }
    return grouped;
  }, [tasks]);

  return (
    <div className={styles['roadmap-kanban']}>
      {COLUMNS.map((status) => (
        <div key={status} className={styles['roadmap-kanban__column']}>
          <div className={styles['roadmap-kanban__column-header']}>
            <span className={styles['roadmap-task-card__status-dot']} data-status={status} />
            <span>{t(`taskStatus.${status}`)}</span>
            <span className={styles['roadmap-kanban__column-count']}>{columns[status].length}</span>
          </div>

          {columns[status].map((task) => (
            <div key={task.id} className={styles['roadmap-kanban__card']}>
              <div className={styles['roadmap-kanban__card-title']}>
                {task.title || t('roadmapPanel.taskTitle')}
              </div>
              <div className={styles['roadmap-kanban__card-meta']}>
                <span>{task.assigneeId ? memberNames.get(task.assigneeId) ?? task.assigneeId : t('roadmapPanel.unassigned')}</span>
                <div className={styles['roadmap-kanban__card-actions']}>
                  <select
                    className={styles['roadmap-task-card__status-select']}
                    data-status={task.status}
                    value={task.status}
                    onChange={(e) => onTaskChange(task.id, { status: e.currentTarget.value })}
                    disabled={disableInputs}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`${styles['roadmap-task-card__icon-btn']} ${styles['roadmap-task-card__icon-btn--danger']}`}
                    onClick={() => onDelete(task.id)}
                    disabled={disableInputs}
                    aria-label={t('roadmapPanel.deleteTask')}
                  >
                    &#10005;
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
