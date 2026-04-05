export type AppEnv = {
  apiBaseUrl: string;
  wsBaseUrl: string;
  defaultWorkspaceId: string;
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
    rawEnv.OPEN_KRAKEN_API_BASE_URL ?? 'http://127.0.0.1:8080/api/v1',
    'http://127.0.0.1:8080/api/v1'
  );
  const wsBaseUrl = coerceUrl(rawEnv.OPEN_KRAKEN_WS_BASE_URL ?? 'ws://127.0.0.1:8080/ws', 'ws://127.0.0.1:8080/ws');
  const defaultWorkspaceId = (rawEnv.OPEN_KRAKEN_WORKSPACE_ID ?? 'ws_open_kraken').trim() || 'ws_open_kraken';

  return {
    apiBaseUrl,
    wsBaseUrl,
    defaultWorkspaceId
  };
};

export const appEnv = parseAppEnv(import.meta.env as unknown as RawEnv);
