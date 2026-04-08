import { appEnv } from '@/config/env';
import type { AuthAccount } from './auth-types';

const resolveAuthBaseUrl = () => {
  const fromEnv = appEnv.apiBaseUrl;
  if (fromEnv !== 'http://127.0.0.1:8080/api/v1') {
    return fromEnv;
  }
  if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
    return `${window.location.origin}/api/v1`;
  }
  return fromEnv;
};

export type LoginResponse = {
  token: string;
  account: AuthAccount;
};

export async function login(memberId: string, password: string): Promise<LoginResponse> {
  const baseUrl = resolveAuthBaseUrl().replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, password })
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
      throw new Error(
        'Cannot reach the API (network error). Start the backend and ensure the dev proxy targets it, or check OPEN_KRAKEN / VITE API base URL.'
      );
    }
    throw e instanceof Error ? e : new Error('Login failed');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? 'Login failed');
  }

  return (await response.json()) as LoginResponse;
}

export async function fetchMe(token: string): Promise<AuthAccount> {
  const baseUrl = resolveAuthBaseUrl().replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: token }
  });

  if (!response.ok) {
    throw new Error('Session expired');
  }

  return (await response.json()) as AuthAccount;
}
