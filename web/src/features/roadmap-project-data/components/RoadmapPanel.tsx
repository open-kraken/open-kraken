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

const STATUS_OPTIONS = ['todo', 'in_progress', 'done', 'blocked'];

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
  return (
    <section className="roadmap-project-panel" data-tone={feedback.tone} aria-label="roadmap-panel">
      <header className="roadmap-project-panel__header">
        <div>
          <p className="roadmap-project-panel__eyebrow">Roadmap</p>
          <h2 className="roadmap-project-panel__title">RoadmapPanel</h2>
        </div>
        <div className="roadmap-project-panel__actions">
          <button type="button" onClick={onReload} disabled={feedback.disableReload}>
            Reload
          </button>
          <button type="button" onClick={onSave} disabled={feedback.disableSave}>
            Save roadmap
          </button>
        </div>
      </header>

      <div className="roadmap-project-panel__banner" data-tone={feedback.tone}>
        <strong>{feedback.title}</strong>
        <p>{feedback.detail}</p>
        {feedback.warning ? <p className="roadmap-project-panel__warning">Warning: {feedback.warning}</p> : null}
        {feedback.showReloadChoices ? (
          <div className="roadmap-project-panel__choice-row">
            <button type="button" onClick={onKeepDraft}>
              Keep local draft
            </button>
            <button type="button" onClick={onDiscardAndReload}>
              Discard and reload
            </button>
          </div>
        ) : null}
      </div>

      <label className="roadmap-project-panel__field">
        <span>Objective</span>
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
              <span className="roadmap-project-panel__task-number">#{task.number}</span>
              <label className="roadmap-project-panel__checkbox">
                <input
                  type="checkbox"
                  checked={task.pinned}
                  onChange={(event) => onTaskChange(task.id, { pinned: event.currentTarget.checked })}
                  disabled={feedback.disableInputs}
                />
                Pinned
              </label>
            </div>

            <label className="roadmap-project-panel__field">
              <span>Title</span>
              <input
                type="text"
                value={task.title}
                onChange={(event) => onTaskChange(task.id, { title: event.currentTarget.value })}
                disabled={feedback.disableInputs}
              />
            </label>

            <label className="roadmap-project-panel__field">
              <span>Status</span>
              <select
                value={task.status}
                onChange={(event) => onTaskChange(task.id, { status: event.currentTarget.value })}
                disabled={feedback.disableInputs}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
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
