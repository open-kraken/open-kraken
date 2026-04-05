import { useI18n } from '@/i18n/I18nProvider';

export type MemberCliPreviewProps = {
  terminalId: string;
  lines: string[];
  onOpenSessions: () => void;
};

export const MemberCliPreview = ({ terminalId, lines, onOpenSessions }: MemberCliPreviewProps) => {
  const { t } = useI18n();
  const defaults = [t('members.cliDefaultLine1'), t('members.cliDefaultLine2')];
  const body = lines.length > 0 ? lines : defaults;

  return (
    <div className="member-cli-preview" data-terminal-id={terminalId}>
      <div className="member-cli-preview__chrome">
        <span className="member-cli-preview__dots" aria-hidden="true">
          <span /> <span /> <span />
        </span>
        <span className="member-cli-preview__title">{t('members.cliTitle', { terminalId })}</span>
      </div>
      <pre className="member-cli-preview__body" aria-label={t('members.cliAria')}>
        {body.join('\n')}
      </pre>
      <div className="member-cli-preview__footer">
        <button type="button" className="member-cli-preview__open" onClick={onOpenSessions}>
          {t('members.openInSessions')}
        </button>
      </div>
    </div>
  );
};
