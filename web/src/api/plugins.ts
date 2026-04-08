/**
 * Phase 8: Plugin API client.
 */
import type { HttpClient } from './http-client';

export type PluginDTO = {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  rating: string;
  icon: string;
  installed: boolean;
  installedAt?: string;
};

export type PluginListResponse = { items: PluginDTO[] };

export const createPluginApi = (http: HttpClient) => ({
  listAvailable: () => http.get<PluginListResponse>('plugins'),
  listInstalled: () => http.get<PluginListResponse>('plugins/installed'),
  install: (pluginId: string) => http.post<PluginDTO>(`plugins/${pluginId}/install`),
  remove: (pluginId: string) => http.request<void>(`plugins/${pluginId}`, { method: 'DELETE' }),
});
