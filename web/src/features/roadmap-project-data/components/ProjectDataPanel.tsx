import { useI18n } from '@/i18n/I18nProvider';
import { translatePanelDetail } from '@/i18n/panel-detail';
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
  const { t } = useI18n();
  const detailText = feedback.detailKey ? t(feedback.detailKey) : translatePanelDetail(feedback.detail, t);

  return (
    <section
      className="roadmap-project-panel roadmap-project-panel--data"
      data-tone={feedback.tone}
      aria-label="project-data-panel"
    >
      <header className="roadmap-project-panel__header">
        <div className="roadmap-project-panel__title-block">
          <p className="roadmap-project-panel__eyebrow">{t('projectDataPanel.eyebrow')}</p>
          <h2 className="roadmap-project-panel__title">{t('projectDataPanel.title')}</h2>
          <p className="roadmap-project-panel__subtitle">{t('projectDataPanel.subtitle')}</p>
        </div>
        <div className="roadmap-project-panel__actions">
          <button type="button" data-action="reload" onClick={onReload} disabled={feedback.disableReload}>
            {t('projectDataPanel.reload')}
          </button>
          <button type="button" data-action="save" onClick={onSave} disabled={feedback.disableSave}>
            {t('projectDataPanel.save')}
          </button>
        </div>
      </header>

      <div className="roadmap-project-panel__banner" data-tone={feedback.tone}>
        <strong>{t(feedback.titleKey)}</strong>
        <p>{detailText}</p>
        <p className="roadmap-project-panel__meta">
          {t('projectDataPanel.storage')} <span>{value.storage}</span>
        </p>
        {feedback.warning ? (
          <p className="roadmap-project-panel__warning">
            {t('projectDataPanel.warningPrefix')} {feedback.warning}
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
        <span>{t('projectDataPanel.payloadJson')}</span>
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
