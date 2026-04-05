import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/theme/ThemeProvider';

export const ThemeToggle = () => {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label={t('shell.themeLabel')}>
      <span className="theme-toggle__label">{t('shell.themeLabel')}</span>
      <div className="theme-toggle__buttons">
        <button
          type="button"
          className={theme === 'light' ? 'theme-toggle__btn theme-toggle__btn--active' : 'theme-toggle__btn'}
          aria-pressed={theme === 'light'}
          onClick={() => setTheme('light')}
        >
          {t('shell.themeLight')}
        </button>
        <button
          type="button"
          className={theme === 'dark' ? 'theme-toggle__btn theme-toggle__btn--active' : 'theme-toggle__btn'}
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme('dark')}
        >
          {t('shell.themeDark')}
        </button>
      </div>
    </div>
  );
};
