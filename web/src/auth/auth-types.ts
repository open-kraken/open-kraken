export type AuthAccount = {
  memberId: string;
  workspaceId: string;
  displayName: string;
  role: 'owner' | 'supervisor' | 'assistant' | 'member';
  avatar: string;
};

export type AuthSession = {
  token: string;
  account: AuthAccount;
};

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: AuthSession };
