import { getApiConfig } from './config.mjs';
import { createLiveClient } from './live-client.mjs';
import { createMockClient } from '../mocks/mock-client.mjs';

export const createApiClient = ({ env = process.env, fetchImpl, WebSocketImpl } = {}) => {
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
