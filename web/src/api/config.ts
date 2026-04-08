export type ApiConfig = {
  mode: 'mock' | 'live';
  apiBaseUrl: string;
  wsBaseUrl: string;
  workspaceId: string;
};

export const getApiConfig = (env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): ApiConfig => {
  const mode = env.OPEN_KRAKEN_API_MODE === 'mock' ? 'mock' : 'live';
  return {
    mode,
    apiBaseUrl:
      env.OPEN_KRAKEN_API_BASE_URL ??
      env.VITE_OPEN_KRAKEN_API_BASE_URL ??
      env.VITE_API_BASE_URL ??
      'http://127.0.0.1:8080/api/v1',
    wsBaseUrl:
      env.OPEN_KRAKEN_WS_BASE_URL ?? env.VITE_OPEN_KRAKEN_WS_BASE_URL ?? env.VITE_WS_BASE_URL ?? 'ws://127.0.0.1:8080/ws',
    workspaceId: env.OPEN_KRAKEN_WORKSPACE_ID ?? env.VITE_OPEN_KRAKEN_WORKSPACE_ID ?? 'ws_open_kraken'
  };
};
