import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { RoadmapTaskItem, RoadmapTaskStatus } from '../api-client';
import styles from '../roadmap-feature.module.css';

const STATUS_OPTIONS: RoadmapTaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];

export type RoadmapTaskCardProps = {
  task: RoadmapTaskItem;
  disableInputs: boolean;
  isFirst: boolean;
  isLast: boolean;
  onTaskChange: (taskId: string, patch: Partial<RoadmapTaskItem>) => void;
  onDelete: (taskId: string) => void;
  onMove: (taskId: string, direction: 'up' | 'down') => void;
};

export const RoadmapTaskCard = ({
  task,
  disableInputs,
  isFirst,
  isLast,
  onTaskChange,
  onDelete,
  onMove
}: RoadmapTaskCardProps) => {
  const { t } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <article className={styles['roadmap-task-card']}>
      <div className={styles['roadmap-task-card__header']}>
        <span className={styles['roadmap-task-card__status-dot']} data-status={task.status} />
        <span className={styles['roadmap-task-card__number']}>{t('roadmapPanel.taskNumber', { n: task.number })}</span>
        <input
          type="text"
          className={styles['roadmap-task-card__title-input']}
          value={task.title}
          onChange={(e) => onTaskChange(task.id, { title: e.currentTarget.value })}
          disabled={disableInputs}
          placeholder={t('roadmapPanel.taskTitle')}
        />
      </div>

      <div className={styles['roadmap-task-card__body']}>
        <select
          className={styles['roadmap-task-card__status-select']}
          data-status={task.status}
          value={task.status}
          onChange={(e) => onTaskChange(task.id, { status: e.currentTarget.value })}
          disabled={disableInputs}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{t(`taskStatus.${status}`)}</option>
          ))}
        </select>

        <label className={styles['roadmap-task-card__pin-label']}>
          <input
            type="checkbox"
            checked={task.pinned}
            onChange={(e) => onTaskChange(task.id, { pinned: e.currentTarget.checked })}
            disabled={disableInputs}
          />
          {t('roadmapPanel.pinned')}
        </label>

        <span className={styles['roadmap-task-card__assignee']}>
          {task.assigneeId ?? t('roadmapPanel.unassigned')}
        </span>

        <div className={styles['roadmap-task-card__actions']}>
          <button
            type="button"
            className={styles['roadmap-task-card__icon-btn']}
            onClick={() => onMove(task.id, 'up')}
            disabled={disableInputs || isFirst}
            title={t('roadmapPanel.moveUp')}
            aria-label={t('roadmapPanel.moveUp')}
          >
            &#9650;
          </button>
          <button
            type="button"
            className={styles['roadmap-task-card__icon-btn']}
            onClick={() => onMove(task.id, 'down')}
            disabled={disableInputs || isLast}
            title={t('roadmapPanel.moveDown')}
            aria-label={t('roadmapPanel.moveDown')}
          >
            &#9660;
          </button>
          <button
            type="button"
            className={`${styles['roadmap-task-card__icon-btn']} ${styles['roadmap-task-card__icon-btn--danger']}`}
            onClick={() => setConfirmingDelete(true)}
            disabled={disableInputs}
            title={t('roadmapPanel.deleteTask')}
            aria-label={t('roadmapPanel.deleteTask')}
          >
            &#10005;
          </button>
        </div>
      </div>

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
