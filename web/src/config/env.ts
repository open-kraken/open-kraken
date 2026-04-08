export type AppEnv = {
  apiBaseUrl: string;
  wsBaseUrl: string;
  defaultWorkspaceId: string;
  /** Optional login form prefill (dev convenience; use env in non-dev builds). */
  loginPrefillMemberId: string;
  loginPrefillPassword: string;
  /**
   * Langfuse (or compatible) web UI origin for observability — not the OTLP endpoint.
   * Set `VITE_LANGFUSE_UI_URL` (e.g. https://cloud.langfuse.com) to show a link in Settings.
   */
  langfuseUiUrl: string | null;
  /**
   * When true, API requests send W3C `traceparent` so backend OTLP spans link to the browser hop.
   * Set `VITE_OPEN_KRAKEN_TRACE_CONTEXT=0` to disable.
   */
  browserTraceContext: boolean;
};

type RawEnv = Record<string, string | undefined>;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const coerceUrl = (value: string, fallback: string) => {
  try {
    return trimTrailingSlash(new URL(value).toString());
  } catch {
    return fallback;
  }
};

export const parseAppEnv = (rawEnv: RawEnv = {}): AppEnv => {
  const apiBaseUrl = coerceUrl(
    rawEnv.VITE_OPEN_KRAKEN_API_BASE_URL ??
      rawEnv.VITE_API_BASE_URL ??
      rawEnv.OPEN_KRAKEN_API_BASE_URL ??
      'http://127.0.0.1:8080/api/v1',
    'http://127.0.0.1:8080/api/v1'
  );
  const wsBaseUrl = coerceUrl(
    rawEnv.VITE_OPEN_KRAKEN_WS_BASE_URL ?? rawEnv.VITE_WS_BASE_URL ?? rawEnv.OPEN_KRAKEN_WS_BASE_URL ?? 'ws://127.0.0.1:8080/ws',
    'ws://127.0.0.1:8080/ws'
  );
  const defaultWorkspaceId = (rawEnv.OPEN_KRAKEN_WORKSPACE_ID ?? 'ws_open_kraken').trim() || 'ws_open_kraken';

  const loginPrefillMemberId = (rawEnv.VITE_OPEN_KRAKEN_LOGIN_PREFILL_MEMBER_ID ?? '').trim();
  const loginPrefillPassword = rawEnv.VITE_OPEN_KRAKEN_LOGIN_PREFILL_PASSWORD ?? '';

  const rawLangfuse = (rawEnv.VITE_LANGFUSE_UI_URL ?? '').trim();
  const langfuseUiUrl: string | null = (() => {
    if (!rawLangfuse) return null;
    try {
      return trimTrailingSlash(new URL(rawLangfuse).href);
    } catch {
      return null;
    }
  })();

  const traceRaw = (rawEnv.VITE_OPEN_KRAKEN_TRACE_CONTEXT ?? '').trim().toLowerCase();
  const browserTraceContext = traceRaw !== '0' && traceRaw !== 'false' && traceRaw !== 'off' && traceRaw !== 'no';

  return {
    apiBaseUrl,
    wsBaseUrl,
    defaultWorkspaceId,
    loginPrefillMemberId,
    loginPrefillPassword,
    langfuseUiUrl,
    browserTraceContext
  };
};

export const appEnv = parseAppEnv(import.meta.env as unknown as RawEnv);

/**
 * When the UI is served from Vite but env still points API at localhost:8080, use same-origin `/api/v1`
 * so requests go through the Vite proxy (avoids CORS).
 */
export function resolveBrowserApiBaseUrl(): string {
  const fromEnv = appEnv.apiBaseUrl;
  if (typeof window === 'undefined' || !window.location.origin.startsWith('http')) {
    return fromEnv;
  }
  try {
    const configured = new URL(fromEnv);
    const localBackend =
      (configured.hostname === '127.0.0.1' || configured.hostname === 'localhost') && configured.port === '8080';
    if (!localBackend) {
      return fromEnv;
    }
    return `${window.location.origin}/api/v1`;
  } catch {
    return fromEnv;
  }
}

/**
 * When env targets `ws://127.0.0.1:8080/ws`, use `ws(s)://<current page host>/ws` so the socket uses
 * the Vite proxy; backend WebSocket CheckOrigin then sees same Host as the page.
 */
export function resolveBrowserWsBaseUrl(): string {
  const fromEnv = appEnv.wsBaseUrl;
  if (typeof window === 'undefined' || !window.location.origin.startsWith('http')) {
    return fromEnv;
  }
  try {
    const configured = new URL(fromEnv);
    const path = configured.pathname.replace(/\/+$/, '') || '/';
    const localBackend =
      (configured.hostname === '127.0.0.1' || configured.hostname === 'localhost') &&
      configured.port === '8080' &&
      path === '/ws';
    if (!localBackend) {
      return fromEnv;
    }
    const u = new URL(window.location.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return fromEnv;
  }
}
