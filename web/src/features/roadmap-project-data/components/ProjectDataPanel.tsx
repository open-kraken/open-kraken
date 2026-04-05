import type { ProjectDataDocument } from '../api-client';
import type { PanelFeedback } from '../store';

export type ProjectDataPanelProps = {
  value: ProjectDataDocument;
  draftText: string;
  feedback: PanelFeedback;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onReload: () => void;
  onKeepDraft: () => void;
  onDiscardAndReload: () => void;
};

export const ProjectDataPanel = ({
  value,
  draftText,
  feedback,
  onDraftChange,
  onSave,
  onReload,
  onKeepDraft,
  onDiscardAndReload
}: ProjectDataPanelProps) => {
  return (
    <section className="roadmap-project-panel" data-tone={feedback.tone} aria-label="project-data-panel">
      <header className="roadmap-project-panel__header">
        <div>
          <p className="roadmap-project-panel__eyebrow">Project data</p>
          <h2 className="roadmap-project-panel__title">ProjectDataPanel</h2>
        </div>
        <div className="roadmap-project-panel__actions">
          <button type="button" onClick={onReload} disabled={feedback.disableReload}>
            Reload
          </button>
          <button type="button" onClick={onSave} disabled={feedback.disableSave}>
            Save project data
          </button>
        </div>
      </header>

      <div className="roadmap-project-panel__banner" data-tone={feedback.tone}>
        <strong>{feedback.title}</strong>
        <p>{feedback.detail}</p>
        <p className="roadmap-project-panel__meta">
          Storage source: <span>{value.storage}</span>
        </p>
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
        <span>Payload JSON</span>
        <textarea
          value={draftText}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          disabled={feedback.disableInputs}
          rows={18}
          spellCheck={false}
        />
      </label>
    </section>
  );
};
