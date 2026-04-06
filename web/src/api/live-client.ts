import { createHttpClient } from './http-client-legacy';

export type LegacyApiClient = {
  workspaceId: string;
  getConversations: () => Promise<unknown>;
  getMessages: (conversationId: string) => Promise<unknown>;
  sendMessage: (conversationId: string, payload: unknown) => Promise<unknown>;
  getMembers: () => Promise<unknown>;
  updateMemberStatus: (memberId: string, patch: Record<string, unknown>) => Promise<unknown>;
  getRoadmap: () => Promise<unknown>;
  updateRoadmap: (roadmap: unknown) => Promise<unknown>;
  getProjectData: () => Promise<unknown>;
  updateProjectData: (payload: unknown) => Promise<unknown>;
  attachTerminal: (terminalId: string) => Promise<unknown>;
  subscribe: (listener: (event: unknown) => void) => () => void;
};

type CreateLiveClientOptions = {
  apiBaseUrl: string;
  wsBaseUrl: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
};

export const createLiveClient = ({
  apiBaseUrl,
  wsBaseUrl,
  workspaceId,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket
}: CreateLiveClientOptions): LegacyApiClient => {
  const http = createHttpClient({ apiBaseUrl, fetchImpl });
  const route = (suffix: string) => `/api/v1/workspaces/${workspaceId}${suffix}`;
  return {
    workspaceId,
    async getConversations() {
      return http.request(route('/conversations'));
    },
    async getMessages(conversationId: string) {
      return http.request(route(`/conversations/${conversationId}/messages`));
    },
    async sendMessage(conversationId: string, payload: unknown) {
      return http.request(route(`/conversations/${conversationId}/messages`), {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getMembers() {
      return http.request(route('/members'));
    },
    async updateMemberStatus(memberId: string, patch: Record<string, unknown>) {
      return http.request(route('/members/status'), {
        method: 'PATCH',
        body: JSON.stringify({ memberId, ...patch })
      });
    },
    async getRoadmap() {
      return http.request(route('/roadmap'));
    },
    async updateRoadmap(roadmap: unknown) {
      return http.request(route('/roadmap'), {
        method: 'PUT',
        body: JSON.stringify({ readOnly: false, roadmap })
      });
    },
    async getProjectData() {
      return http.request(route('/project-data'));
    },
    async updateProjectData(payload: unknown) {
      return http.request(route('/project-data'), {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    async attachTerminal(terminalId: string) {
      return http.request(route(`/terminal/sessions/${terminalId}/attach`));
    },
    subscribe(listener: (event: unknown) => void) {
      const ws = new WebSocketImpl(wsBaseUrl);
      ws.addEventListener('message', (event) => listener(JSON.parse(event.data)));
      return () => ws.close();
    }
  };
};
