/**
 * Phase 5: Presence API client.
 */
import type { HttpClient } from './http-client';

export type PresenceMemberDTO = {
  memberId: string;
  status: string;
  terminalStatus: string;
  lastSeenAt: string;
};

export const createPresenceApi = (http: HttpClient) => ({
  setStatus: (workspaceId: string, memberId: string, status: string) =>
    http.request<void>('presence/status', {
      method: 'PUT',
      body: { workspaceId, memberId, status },
    }),
  heartbeat: (workspaceId: string, memberId: string) =>
    http.post<void>('presence/heartbeat', { workspaceId, memberId }),
  listOnline: (workspaceId: string) =>
    http.get<{ members: PresenceMemberDTO[] }>(`presence/online?workspaceId=${workspaceId}`),
});
