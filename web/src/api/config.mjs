export const getApiConfig = (env = process.env) => {
  const mode = env.OPEN_KRAKEN_API_MODE === 'mock' ? 'mock' : 'live';
  return {
    mode,
    apiBaseUrl: env.OPEN_KRAKEN_API_BASE_URL ?? 'http://127.0.0.1:4318',
    wsBaseUrl: env.OPEN_KRAKEN_WS_BASE_URL ?? 'ws://127.0.0.1:4318/ws',
    workspaceId: env.OPEN_KRAKEN_WORKSPACE_ID ?? 'ws_open_kraken'
  };
};
