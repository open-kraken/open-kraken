import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { translatePanelDetail } from '@/i18n/panel-detail';
import type { PanelFeedback } from '../store';
import type { RoadmapDocument, RoadmapTaskItem } from '../api-client';
import { RoadmapProgressSummary } from './RoadmapProgressSummary';
import { RoadmapToolbar, type ViewMode, type StatusFilter } from './RoadmapToolbar';
import { RoadmapTaskCard } from './RoadmapTaskCard';
import { RoadmapKanban } from './RoadmapKanban';
import styles from '../roadmap-feature.module.css';

export type RoadmapPanelProps = {
  value: RoadmapDocument;
  feedback: PanelFeedback;
  onObjectiveChange: (value: string) => void;
  onTaskChange: (taskId: string, patch: Partial<RoadmapTaskItem>) => void;
  onSave: () => void;
  onReload: () => void;
  onKeepDraft: () => void;
  onDiscardAndReload: () => void;
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTask: (taskId: string, direction: 'up' | 'down') => void;
};

export const RoadmapPanel = ({
  value,
  feedback,
  onObjectiveChange,
  onTaskChange,
  onSave,
  onReload,
  onKeepDraft,
  onDiscardAndReload,
  onAddTask,
  onDeleteTask,
  onMoveTask
}: RoadmapPanelProps) => {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const detailText = feedback.detailKey ? t(feedback.detailKey) : translatePanelDetail(feedback.detail, t);

  const filteredTasks = useMemo(
    () => statusFilter === 'all' ? value.tasks : value.tasks.filter((task) => task.status === statusFilter),
    [value.tasks, statusFilter]
  );

  return (
    <section className="roadmap-project-panel" data-tone={feedback.tone} aria-label="roadmap-panel">
      {/* Header */}
      <header className="roadmap-project-panel__header">
        <div>
          <p className="roadmap-project-panel__eyebrow">{t('roadmapPanel.eyebrow')}</p>
          <h2 className="roadmap-project-panel__title">{t('roadmapPanel.title')}</h2>
        </div>
        <div className="roadmap-project-panel__actions">
          <button type="button" onClick={onReload} disabled={feedback.disableReload}>
            {t('roadmapPanel.reload')}
          </button>
          <button type="button" onClick={onSave} disabled={feedback.disableSave}>
            {t('roadmapPanel.save')}
          </button>
        </div>
      </header>

      {/* Status banner */}
      <div className="roadmap-project-panel__banner" data-tone={feedback.tone}>
        <strong>{t(feedback.titleKey)}</strong>
        <p>{detailText}</p>
        {feedback.warning ? (
          <p className="roadmap-project-panel__warning">
            {t('roadmapPanel.warningPrefix')} {feedback.warning}
          </p>
        ) : null}
        {feedback.showReloadChoices ? (
          <div className="roadmap-project-panel__choice-row">
            <button type="button" onClick={onKeepDraft}>
              {t('projectDataPanel.keepDraft')}
            </button>
            <button type="button" onClick={onDiscardAndReload}>
              {t('projectDataPanel.discardReload')}
            </button>
          </div>
        ) : null}
      </div>

      {/* Progress summary */}
      <RoadmapProgressSummary tasks={value.tasks} />

      {/* Objective */}
      <label className="roadmap-project-panel__field">
        <span>{t('roadmapPanel.objective')}</span>
        <textarea
          value={value.objective}
          onChange={(event) => onObjectiveChange(event.currentTarget.value)}
          disabled={feedback.disableInputs}
          rows={3}
        />
      </label>

      {/* Toolbar */}
      <RoadmapToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onAddTask={onAddTask}
        disableAdd={feedback.disableInputs}
      />

      {/* Task content */}
      {filteredTasks.length === 0 ? (
        <div className={styles['roadmap-empty']}>
          <div className={styles['roadmap-empty__icon']}>&#9744;</div>
          <p className={styles['roadmap-empty__text']}>
            {value.tasks.length === 0 ? t('roadmapPanel.emptyState') : t('roadmapPanel.filterAll')}
          </p>
          {value.tasks.length === 0 && (
            <button
              type="button"
              className={styles['roadmap-empty__cta']}
              onClick={onAddTask}
              disabled={feedback.disableInputs}
            >
              {t('roadmapPanel.emptyStateCta')}
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className={styles['roadmap-task-list']}>
          {filteredTasks.map((task, index) => (
            <RoadmapTaskCard
              key={task.id}
              task={task}
              disableInputs={feedback.disableInputs}
              isFirst={index === 0}
              isLast={index === filteredTasks.length - 1}
              onTaskChange={onTaskChange}
              onDelete={onDeleteTask}
              onMove={onMoveTask}
            />
          ))}
        </div>
      ) : (
        <RoadmapKanban
          tasks={filteredTasks}
          disableInputs={feedback.disableInputs}
          onTaskChange={onTaskChange}
          onDelete={onDeleteTask}
        />
      )}
    </section>
  );
};
