import { getApiConfig } from './config';
import { createLiveClient, type LegacyApiClient } from './live-client';
import { createMockClient } from '../mocks/mock-client';

type CreateApiClientOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
};

/**
 * Legacy HTTP + WebSocket client. Default is **live** backend only (no silent mock fallback).
 * Set `OPEN_KRAKEN_API_MODE=mock` explicitly for offline fixture demos or tests.
 */
export const createApiClient = ({ env = process.env as Record<string, string | undefined>, fetchImpl, WebSocketImpl }: CreateApiClientOptions = {}): LegacyApiClient => {
  const config = getApiConfig(env);
  if (config.mode === 'mock') {
    return createMockClient({ workspaceId: config.workspaceId });
  }
  return createLiveClient({
    apiBaseUrl: config.apiBaseUrl,
    wsBaseUrl: config.wsBaseUrl,
    workspaceId: config.workspaceId,
    fetchImpl,
    WebSocketImpl
  });
};
