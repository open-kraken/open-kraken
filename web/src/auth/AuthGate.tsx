import type { PropsWithChildren } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from './AuthProvider';
import { LoginPage } from './LoginPage';

/**
 * Shows the login page when unauthenticated; renders children when authenticated.
 * During the initial session-restore check, shows a minimal loading state.
 */
export const AuthGate = ({ children }: PropsWithChildren) => {
  const { state } = useAuth();
  const { t } = useI18n();

  if (state.status === 'loading') {
    return (
      <div className="login-page login-page--session">
        <p className="login-page__session-hint">{t('shell.sessionRestoring')}</p>
      </div>
    );
  }

  if (state.status === 'unauthenticated') {
    return <LoginPage />;
  }

  return <>{children}</>;
};
