import { useI18n } from '@/i18n/I18nProvider';
import { translatePanelDetail } from '@/i18n/panel-detail';
import type { PanelFeedback } from '../store';
import type { RoadmapDocument, RoadmapTaskItem } from '../api-client';

export type RoadmapPanelProps = {
  value: RoadmapDocument;
  feedback: PanelFeedback;
  onObjectiveChange: (value: string) => void;
  onTaskChange: (taskId: string, patch: Partial<RoadmapTaskItem>) => void;
  onSave: () => void;
  onReload: () => void;
  onKeepDraft: () => void;
  onDiscardAndReload: () => void;
};

const STATUS_OPTIONS = ['todo', 'in_progress', 'done', 'blocked'] as const;

export const RoadmapPanel = ({
  value,
  feedback,
  onObjectiveChange,
  onTaskChange,
  onSave,
  onReload,
  onKeepDraft,
  onDiscardAndReload
}: RoadmapPanelProps) => {
  const { t } = useI18n();

  const detailText = feedback.detailKey ? t(feedback.detailKey) : translatePanelDetail(feedback.detail, t);

  return (
    <section className="roadmap-project-panel" data-tone={feedback.tone} aria-label="roadmap-panel">
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

      <label className="roadmap-project-panel__field">
        <span>{t('roadmapPanel.objective')}</span>
        <textarea
          value={value.objective}
          onChange={(event) => onObjectiveChange(event.currentTarget.value)}
          disabled={feedback.disableInputs}
          rows={4}
        />
      </label>

      <div className="roadmap-project-panel__task-list">
        {value.tasks.map((task) => (
          <article key={task.id} className="roadmap-project-panel__task-card">
            <div className="roadmap-project-panel__task-meta">
              <span className="roadmap-project-panel__task-number">
                {t('roadmapPanel.taskNumber', { n: task.number })}
              </span>
              <label className="roadmap-project-panel__checkbox">
                <input
                  type="checkbox"
                  checked={task.pinned}
                  onChange={(event) => onTaskChange(task.id, { pinned: event.currentTarget.checked })}
                  disabled={feedback.disableInputs}
                />
                {t('roadmapPanel.pinned')}
              </label>
            </div>

            <label className="roadmap-project-panel__field">
              <span>{t('roadmapPanel.taskTitle')}</span>
              <input
                type="text"
                value={task.title}
                onChange={(event) => onTaskChange(task.id, { title: event.currentTarget.value })}
                disabled={feedback.disableInputs}
              />
            </label>

            <label className="roadmap-project-panel__field">
              <span>{t('roadmapPanel.taskStatus')}</span>
              <select
                value={task.status}
                onChange={(event) => onTaskChange(task.id, { status: event.currentTarget.value })}
                disabled={feedback.disableInputs}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {t(`taskStatus.${status}`)}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
};
