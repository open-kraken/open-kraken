/**
 * Returns a v2 base URL by replacing the `/api/v1` suffix with `/api/v2`.
 * Falls back to constructing it from window.location when on a dev server.
 */
function resolveV2BaseUrl(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    return `${origin}/api/v2`;
  }
  return 'http://127.0.0.1:8080/api/v2';
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

  const response = await fetch(url, {
    method: opts.method,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });

  if (!response.ok) {
    let message = `v2 request failed: ${response.status}`;
    try {
      const err = (await response.json()) as { message?: string };
      if (err.message) message = err.message;
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
