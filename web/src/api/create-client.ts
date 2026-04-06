import { getApiConfig } from './config';
import { createLiveClient, type LegacyApiClient } from './live-client';
import { createMockClient } from '../mocks/mock-client';
import { createResilientClient } from './resilient-client';

type CreateApiClientOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
};

export const createApiClient = ({ env = process.env as Record<string, string | undefined>, fetchImpl, WebSocketImpl }: CreateApiClientOptions = {}): LegacyApiClient => {
  const config = getApiConfig(env);
  if (config.mode === 'mock') {
    return createMockClient({ workspaceId: config.workspaceId });
  }
  const liveClient = createLiveClient({
    apiBaseUrl: config.apiBaseUrl,
    wsBaseUrl: config.wsBaseUrl,
    workspaceId: config.workspaceId,
    fetchImpl,
    WebSocketImpl
  });
  const fallbackClient = createMockClient({ workspaceId: config.workspaceId });
  return createResilientClient(liveClient, fallbackClient);
};
