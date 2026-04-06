import { useCallback, useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';

export const LoginPage = () => {
  const { login } = useAuth();
  const [memberId, setMemberId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);
      try {
        await login(memberId.trim(), password);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    },
    [login, memberId, password]
  );

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="login-card__header">
          <div className="login-card__brand">
            <span className="login-card__logo" aria-hidden />
            <span className="login-card__brand-text">Open Kraken</span>
          </div>
          <h1 className="login-card__title">Sign in to Console</h1>
          <p className="login-card__subtitle">Enter your member credentials to continue</p>
        </header>

        <form className="login-card__form" onSubmit={handleSubmit}>
          <div className="login-card__field">
            <label htmlFor="login-member-id" className="login-card__label">
              Member ID
            </label>
            <input
              id="login-member-id"
              type="text"
              className="login-card__input"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="e.g. owner_1"
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="login-card__field">
            <label htmlFor="login-password" className="login-card__label">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="login-card__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="login-card__error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="login-card__submit" disabled={loading || !memberId.trim() || !password}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <footer className="login-card__footer">
          <p className="login-card__hint">
            Dev accounts: <code>owner_1 / admin</code>, <code>assistant_1 / planner</code>, <code>member_1 / runner</code>
          </p>
        </footer>
      </div>
    </div>
  );
};
