import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { RoadmapTaskItem, RoadmapTaskStatus } from '../api-client';
import styles from '../roadmap-feature.module.css';

const STATUS_OPTIONS: RoadmapTaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export type RoadmapTaskCardProps = {
  task: RoadmapTaskItem;
  allTasks: RoadmapTaskItem[];
  members: Array<{ memberId: string; displayName?: string }>;
  disableInputs: boolean;
  isFirst: boolean;
  isLast: boolean;
  onTaskChange: (taskId: string, patch: Partial<RoadmapTaskItem>) => void;
  onDelete: (taskId: string) => void;
  onMove: (taskId: string, direction: 'up' | 'down') => void;
};

export const RoadmapTaskCard = ({
  task,
  allTasks,
  members,
  disableInputs,
  isFirst,
  isLast,
  onTaskChange,
  onDelete,
  onMove
}: RoadmapTaskCardProps) => {
  const { t } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const depTitles = (task.dependencies ?? [])
    .map((depId) => allTasks.find((t) => t.id === depId)?.title)
    .filter(Boolean);

  const assigneeName = task.assigneeId
    ? members.find((m) => m.memberId === task.assigneeId)?.displayName ?? task.assigneeId
    : null;

  return (
    <article className={styles['roadmap-task-card']} data-status-accent={task.status}>
      {/* Row 1: status dot + title + assignee + status */}
      <div className={styles['roadmap-task-card__header']}>
        <span className={styles['roadmap-task-card__status-dot']} data-status={task.status} />
        <span className={styles['roadmap-task-card__number']}>#{task.number}</span>
        <input
          type="text"
          className={styles['roadmap-task-card__title-input']}
          value={task.title}
          onChange={(e) => onTaskChange(task.id, { title: e.currentTarget.value })}
          disabled={disableInputs}
          placeholder={t('roadmapPanel.taskTitle')}
        />
        <select
          className={styles['roadmap-task-card__status-select']}
          data-status={task.status}
          value={task.status}
          onChange={(e) => {
            const next = e.currentTarget.value;
            const patch: Partial<RoadmapTaskItem> = { status: next };
            if (next === 'in_progress' && !task.startedAt) {
              patch.startedAt = new Date().toISOString();
            }
            if (next === 'done' && !task.completedAt) {
              patch.completedAt = new Date().toISOString();
            }
            onTaskChange(task.id, patch);
          }}
          disabled={disableInputs}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>
          ))}
        </select>
        <button
          type="button"
          className={styles['roadmap-task-card__expand-btn']}
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
      </div>

      {/* Row 2: meta line (always visible) */}
      <div className={styles['roadmap-task-card__meta']}>
        <span className={styles['roadmap-task-card__meta-item']} data-label="assignee">
          {assigneeName ?? t('roadmapPanel.unassigned')}
        </span>
        {depTitles.length > 0 && (
          <span className={styles['roadmap-task-card__meta-item']} data-label="deps">
            ← {depTitles.join(', ')}
          </span>
        )}
        <span className={styles['roadmap-task-card__meta-item']} data-label="dates">
          {formatDate(task.startedAt)} → {formatDate(task.dueAt)}
        </span>
        {task.completedAt && (
          <span className={styles['roadmap-task-card__meta-item']} data-label="done">
            ✓ {formatDate(task.completedAt)}
          </span>
        )}
      </div>

      {/* Expanded: edit all fields */}
      {expanded && (
        <div className={styles['roadmap-task-card__detail']}>
          <div className={styles['roadmap-task-card__field-row']}>
            <label className={styles['roadmap-task-card__field']}>
              <span>{t('roadmapPanel.assignee')}</span>
              <select
                value={task.assigneeId ?? ''}
                onChange={(e) => onTaskChange(task.id, { assigneeId: e.currentTarget.value || null })}
                disabled={disableInputs}
              >
                <option value="">{t('roadmapPanel.unassigned')}</option>
                {members.map((m) => (
                  <option key={m.memberId} value={m.memberId}>{m.displayName ?? m.memberId}</option>
                ))}
              </select>
            </label>
            <label className={styles['roadmap-task-card__field']}>
              <span>{t('roadmapPanel.startDate')}</span>
              <input
                type="date"
                value={task.startedAt?.split('T')[0] ?? ''}
                onChange={(e) => onTaskChange(task.id, { startedAt: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null })}
                disabled={disableInputs}
              />
            </label>
            <label className={styles['roadmap-task-card__field']}>
              <span>{t('roadmapPanel.dueDate')}</span>
              <input
                type="date"
                value={task.dueAt?.split('T')[0] ?? ''}
                onChange={(e) => onTaskChange(task.id, { dueAt: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null })}
                disabled={disableInputs}
              />
            </label>
          </div>

          <label className={styles['roadmap-task-card__field']}>
            <span>{t('roadmapPanel.dependencies')}</span>
            <select
              multiple
              value={task.dependencies ?? []}
              onChange={(e) => {
                const selected = Array.from(e.currentTarget.selectedOptions, (o) => o.value);
                onTaskChange(task.id, { dependencies: selected });
              }}
              disabled={disableInputs}
              className={styles['roadmap-task-card__multi-select']}
            >
              {allTasks.filter((t) => t.id !== task.id).map((t) => (
                <option key={t.id} value={t.id}>#{t.number} {t.title || '(untitled)'}</option>
              ))}
            </select>
          </label>

          <div className={styles['roadmap-task-card__actions']}>
            <button type="button" onClick={() => onMove(task.id, 'up')} disabled={disableInputs || isFirst}>↑</button>
            <button type="button" onClick={() => onMove(task.id, 'down')} disabled={disableInputs || isLast}>↓</button>
            <label>
              <input
                type="checkbox"
                checked={task.pinned}
                onChange={(e) => onTaskChange(task.id, { pinned: e.currentTarget.checked })}
                disabled={disableInputs}
              />
              {t('roadmapPanel.pinned')}
            </label>
            <button
              type="button"
              className={styles['roadmap-task-card__icon-btn--danger']}
              onClick={() => setConfirmingDelete(true)}
              disabled={disableInputs}
            >
              {t('roadmapPanel.deleteTask')}
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className={styles['roadmap-task-card__confirm']}>
          <span>{t('roadmapPanel.confirmDelete')}</span>
          <button type="button" onClick={() => { onDelete(task.id); setConfirmingDelete(false); }}>
            {t('roadmapPanel.confirmDeleteYes')}
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)}>
            {t('roadmapPanel.confirmDeleteNo')}
          </button>
        </div>
      )}
    </article>
  );
};
