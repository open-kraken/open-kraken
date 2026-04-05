import { workspaceFixture } from '../fixtures/workspace-fixture.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const createMockStore = () => {
  const state = clone(workspaceFixture);
  return {
    getWorkspace() {
      return clone(state.workspace);
    },
    listConversations() {
      return clone(state.conversations);
    },
    listMessages(conversationId) {
      return clone(state.messages[conversationId] ?? []);
    },
    appendMessage(conversationId, body) {
      const message = {
        id: `msg_${state.messages[conversationId].length + 1}`,
        senderId: body.senderId,
        content: body.content,
        createdAt: Date.now(),
        isAi: Boolean(body.isAI),
        status: 'sent',
        attachment: body.attachment ?? null
      };
      state.messages[conversationId].push(message);
      return clone(message);
    },
    getMembers() {
      return clone(state.members);
    },
    updateMemberStatus(memberId, patch) {
      const member = state.members.members.find((item) => item.memberId === memberId);
      if (!member) {
        throw new Error('member_not_found');
      }
      Object.assign(member, patch);
      return clone(state.members);
    },
    getRoadmap() {
      return clone(state.roadmap);
    },
    updateRoadmap(nextRoadmap) {
      state.roadmap = clone(nextRoadmap);
      state.projectData.roadmap = clone(nextRoadmap);
      return clone(state.roadmap);
    },
    getProjectData() {
      return clone(state.projectData);
    },
    updateProjectData(nextPayload) {
      state.projectData = {
        ...clone(state.projectData),
        ...clone(nextPayload)
      };
      return clone(state.projectData);
    },
    attachTerminal(terminalId) {
      const session = state.terminalSessions.find((item) => item.terminalId === terminalId);
      if (!session) {
        throw new Error('terminal_not_found');
      }
      return clone({ session, snapshot: session.snapshot });
    },
    getTerminalSession() {
      return clone(state.terminalSessions[0]);
    }
  };
};
