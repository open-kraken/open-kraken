const STORAGE_KEY = 'ok_auth_session';

export type StoredSession = {
  token: string;
  account: {
    memberId: string;
    workspaceId: string;
    displayName: string;
    role: string;
    avatar: string;
  };
};

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.account?.memberId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
