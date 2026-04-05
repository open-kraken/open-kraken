import { createMockStore } from './mock-store.mjs';

export const createMockClient = ({ workspaceId = 'ws_open_kraken', clock = () => Date.now() } = {}) => {
  const store = createMockStore();
  const listeners = new Set();

  const emit = (event) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    workspaceId,
    async getConversations() {
      const conversations = store.listConversations();
      const firstId = conversations[0]?.id ?? 'conv_general';
      emit({
        event: 'chat.snapshot',
        workspaceId,
        conversationId: firstId,
        messageIds: []
      });
      return { workspace: store.getWorkspace(), conversations };
    },
    async getMessages(conversationId) {
      return { items: store.listMessages(conversationId), nextBeforeId: null };
    },
    async sendMessage(conversationId, payload) {
      const message = store.appendMessage(conversationId, payload);
      emit({
        event: 'chat.delta',
        workspaceId,
        conversationId,
        messageId: message.id,
        sequence: store.listMessages(conversationId).length,
        body: message.content?.text ?? ''
      });
      emit({
        event: 'chat.status',
        workspaceId,
        conversationId,
        messageId: message.id,
        status: message.status
      });
      return { messageId: message.id, message };
    },
    async getMembers() {
      return { readOnly: false, members: store.getMembers() };
    },
    async updateMemberStatus(memberId, patch) {
      const members = store.updateMemberStatus(memberId, patch);
      const event = {
        event: 'presence.snapshot',
        workspaceId,
        members: members.members.map((member) => ({
          memberId: member.memberId,
          presenceState: member.manualStatus,
          terminalStatus: member.terminalStatus,
          lastHeartbeat: new Date().toISOString()
        }))
      };
      emit(event);
      emit({
        event: 'presence.updated',
        workspaceId,
        memberId,
        presenceState: patch.manualStatus ?? members.members.find((m) => m.memberId === memberId)?.manualStatus,
        sentAt: new Date().toISOString()
      });
      return event;
    },
    async getRoadmap() {
      return { readOnly: false, storage: 'workspace', warning: '', roadmap: store.getRoadmap() };
    },
    async updateRoadmap(nextRoadmap) {
      const roadmap = store.updateRoadmap(nextRoadmap);
      const event = { event: 'roadmap.updated', workspaceId, roadmap };
      emit(event);
      return { readOnly: false, storage: 'workspace', warning: '', roadmap };
    },
    async getProjectData() {
      return {
        readOnly: false,
        storage: 'workspace',
        warning: '',
        payload: store.getProjectData()
      };
    },
    async updateProjectData({ payload }) {
      const projectData = store.updateProjectData(payload);
      emit({
        event: 'project-data.updated',
        workspaceId,
        payload: projectData
      });
      return {
        readOnly: false,
        storage: 'workspace',
        warning: '',
        payload: projectData
      };
    },
    async attachTerminal(terminalId) {
      const attached = store.attachTerminal(terminalId);
      const attachEvent = {
        event: 'terminal.attach',
        workspaceId,
        terminalId,
        session: attached.session
      };
      emit(attachEvent);
      emit({
        event: 'terminal.snapshot',
        workspaceId,
        terminalId,
        connectionState: 'attached',
        processState: attached.session.status === 'working' ? 'running' : 'starting',
        rows: attached.snapshot.buffer.rows,
        cols: attached.snapshot.buffer.cols,
        buffer: attached.snapshot.buffer.data
      });
      emit({
        event: 'terminal.delta',
        workspaceId,
        terminalId,
        data: `[mock ${clock()}] attach complete\n`,
        sequence: attached.session.seq
      });
      emit({
        event: 'terminal.status',
        workspaceId,
        terminalId,
        connectionState: 'attached',
        processState: attached.session.status === 'working' ? 'running' : 'idle'
      });
      return attached;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
};
