import { createHttpClient } from './http-client-legacy.mjs';

export const createLiveClient = ({ apiBaseUrl, wsBaseUrl, workspaceId, fetchImpl = fetch, WebSocketImpl = WebSocket }) => {
  const http = createHttpClient({ apiBaseUrl, fetchImpl });
  const route = (suffix) => `/api/v1/workspaces/${workspaceId}${suffix}`;
  return {
    workspaceId,
    async getConversations() {
      return http.request(route('/conversations'));
    },
    async getMessages(conversationId) {
      return http.request(route(`/conversations/${conversationId}/messages`));
    },
    async sendMessage(conversationId, payload) {
      return http.request(route(`/conversations/${conversationId}/messages`), {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    async getMembers() {
      return http.request(route('/members'));
    },
    async updateMemberStatus(memberId, patch) {
      return http.request(route('/members/status'), {
        method: 'PATCH',
        body: JSON.stringify({ memberId, ...patch })
      });
    },
    async getRoadmap() {
      return http.request(route('/roadmap'));
    },
    async updateRoadmap(roadmap) {
      return http.request(route('/roadmap'), {
        method: 'PUT',
        body: JSON.stringify({ readOnly: false, roadmap })
      });
    },
    async getProjectData() {
      return http.request(route('/project-data'));
    },
    async updateProjectData(payload) {
      return http.request(route('/project-data'), {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    async attachTerminal(terminalId) {
      return http.request(route(`/terminal/sessions/${terminalId}/attach`));
    },
    subscribe(listener) {
      const ws = new WebSocketImpl(wsBaseUrl);
      ws.addEventListener('message', (event) => listener(JSON.parse(event.data)));
      return () => ws.close();
    }
  };
};
