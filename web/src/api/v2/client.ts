import { loadSession } from '@/auth/auth-store';
import { appEnv } from '@/config/env';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

/**
 * Returns a v2 base URL from the configured v1 API base. In browser dev mode,
 * local backend URLs are converted to same-origin `/api/v2` so Vite can proxy.
 */
function resolveV2BaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const configured = new URL(appEnv.apiBaseUrl);
      const localBackend =
        (configured.hostname === '127.0.0.1' || configured.hostname === 'localhost') && configured.port === '8080';
      if (localBackend) {
        return `${window.location.origin}/api/v2`;
      }
    } catch {
      return `${window.location.origin}/api/v2`;
    }
  }
  return trimTrailingSlash(appEnv.apiBaseUrl).replace(/\/api\/v1$/, '/api/v2');
}

/**
 * Thin fetch wrapper for v2 API calls.
 * Uses the same JSON conventions as HttpClient but with /api/v2 base.
 */
export async function v2Fetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const base = resolveV2BaseUrl();
  const url = `${base}/${path.replace(/^\/+/, '')}`;
  const token = loadSession()?.token;

  const response = await fetch(url, {
    method: opts.method,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...opts.headers,
    },
  });

  if (!response.ok) {
    let message = `v2 request failed: ${response.status}`;
    try {
      const err = (await response.json()) as { message?: string; error?: { message?: string }; code?: string };
      const detail = err.message ?? err.error?.message;
      if (detail) message = detail;
      if (err.code && detail) message = `${detail} (${err.code})`;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}
