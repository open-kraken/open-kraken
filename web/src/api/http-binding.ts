import { appEnv } from '@/config/env';
import { HttpClient } from '@/api/http-client';

let bound: HttpClient | null = null;

/** Called from AppProviders so API modules use the same base URL as the shell (incl. dev proxy). */
export function bindHttpClient(client: HttpClient): void {
  bound = client;
}

/**
 * Prefer the shell-bound client; otherwise fall back to env (e.g. unit tests without AppProviders).
 * Ensure `VITE_API_BASE_URL` ends with `/api/v1` when calling versioned routes.
 */
export function getHttpClient(): HttpClient {
  if (bound) {
    return bound;
  }
  return new HttpClient({
    baseUrl: appEnv.apiBaseUrl,
    workspaceId: appEnv.defaultWorkspaceId
  });
}
