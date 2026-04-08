import type { AuthContextValue } from '@/auth/AuthProvider';
import type { AuthAccount } from '@/auth/auth-types';

/** Fixed account for AppShell SSR / route tests (no session storage). */
export const shellTestAccount: AuthAccount = {
  memberId: 'owner_1',
  workspaceId: 'ws_open_kraken',
  displayName: 'Test Owner',
  role: 'owner',
  avatar: '🦑'
};

export const shellTestAuthValue: AuthContextValue = {
  state: { status: 'authenticated', session: { token: 'shell_test_token', account: shellTestAccount } },
  login: async () => {},
  logout: () => {},
  account: shellTestAccount,
  token: 'shell_test_token'
};
