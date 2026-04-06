import { createMockStore } from './mock-store';
import type { LegacyApiClient } from '../api/live-client';

type MockClientOptions = {
  workspaceId?: string;
  clock?: () => number;
};

export const createMockClient = ({ workspaceId = 'ws_open_kraken', clock = () => Date.now() }: MockClientOptions = {}): LegacyApiClient => {
  const store = createMockStore();
  const listeners = new Set<(event: unknown) => void>();

  const emit = (event: unknown) => {
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
    async getMessages(conversationId: string) {
      return { items: store.listMessages(conversationId), nextBeforeId: null };
    },
    async sendMessage(conversationId: string, payload: unknown) {
      const message = store.appendMessage(conversationId, payload as Record<string, unknown>);
      emit({
        event: 'chat.delta',
        workspaceId,
        conversationId,
        messageId: message.id,
        sequence: store.listMessages(conversationId).length,
        body: (message.content as Record<string, unknown>)?.text ?? ''
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
    async updateMemberStatus(memberId: string, patch: Record<string, unknown>) {
      const members = store.updateMemberStatus(memberId, patch);
      const event = {
        event: 'presence.snapshot',
        workspaceId,
        members: members.members.map((member: Record<string, unknown>) => ({
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
        presenceState: patch.manualStatus ?? members.members.find((m: Record<string, unknown>) => m.memberId === memberId)?.manualStatus,
        sentAt: new Date().toISOString()
      });
      return event;
    },
    async getRoadmap() {
      return { readOnly: false, storage: 'workspace', warning: '', roadmap: store.getRoadmap() };
    },
    async updateRoadmap(nextRoadmap: unknown) {
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
    async updateProjectData(payload: unknown) {
      const projectData = store.updateProjectData((payload as Record<string, unknown>).payload);
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
    async attachTerminal(terminalId: string) {
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
    subscribe(listener: (event: unknown) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
};
