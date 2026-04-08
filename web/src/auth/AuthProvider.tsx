import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { AuthAccount, AuthSession, AuthState } from './auth-types';
import { fetchMe, login as apiLogin } from './auth-api';
import { clearSession, loadSession, saveSession } from './auth-store';

export type AuthContextValue = {
  state: AuthState;
  login: (memberId: string, password: string) => Promise<void>;
  logout: () => void;
  /** Current authenticated account or null. */
  account: AuthAccount | null;
  /** Current bearer token or null. */
  token: string | null;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Try to restore session on mount
  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      setState({ status: 'unauthenticated' });
      return;
    }

    // Validate session with /auth/me
    void fetchMe(stored.token)
      .then((account) => {
        const session: AuthSession = { token: stored.token, account };
        saveSession({ token: session.token, account: session.account });
        setState({ status: 'authenticated', session });
      })
      .catch(() => {
        clearSession();
        setState({ status: 'unauthenticated' });
      });
  }, []);

  const login = useCallback(async (memberId: string, password: string) => {
    const result = await apiLogin(memberId, password);
    const session: AuthSession = { token: result.token, account: result.account };
    saveSession({ token: session.token, account: session.account });
    setState({ status: 'authenticated', session });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setState({ status: 'unauthenticated' });
  }, []);

  const account = state.status === 'authenticated' ? state.session.account : null;
  const token = state.status === 'authenticated' ? state.session.token : null;

  return (
    <AuthContext.Provider value={{ state, login, logout, account, token }}>
      {children}
    </AuthContext.Provider>
  );
};
