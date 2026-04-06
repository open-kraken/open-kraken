import type { PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { LoginPage } from './LoginPage';

/**
 * Shows the login page when unauthenticated; renders children when authenticated.
 * During the initial session-restore check, shows a minimal loading state.
 */
export const AuthGate = ({ children }: PropsWithChildren) => {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return (
      <div className="login-page">
        <p style={{ color: 'var(--app-text-muted)', fontSize: '0.875rem' }}>Restoring session...</p>
      </div>
    );
  }

  if (state.status === 'unauthenticated') {
    return <LoginPage />;
  }

  return <>{children}</>;
};
