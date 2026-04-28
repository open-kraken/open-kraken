import { workspaceFixture } from '../fixtures/workspace-fixture';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FixtureState = Record<string, any>;

export const createMockStore = () => {
  const state: FixtureState = clone(workspaceFixture);
  return {
    getWorkspace() {
      return clone(state.workspace);
    },
    listConversations() {
      return clone(state.conversations);
    },
    listMessages(conversationId: string) {
      return clone(state.messages[conversationId] ?? []);
    },
    appendMessage(conversationId: string, body: Record<string, unknown>) {
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
    updateMemberStatus(memberId: string, patch: Record<string, unknown>) {
      const member = state.members.members.find((item: FixtureState) => item.memberId === memberId);
      if (!member) {
        throw new Error('member_not_found');
      }
      Object.assign(member, patch);
      return clone(state.members);
    },
    getRoadmap() {
      return clone(state.roadmap);
    },
    updateRoadmap(nextRoadmap: unknown) {
      state.roadmap = clone(nextRoadmap);
      state.projectData.roadmap = clone(nextRoadmap);
      return clone(state.roadmap);
    },
    getProjectData() {
      return clone(state.projectData);
    },
    updateProjectData(nextPayload: unknown) {
      state.projectData = {
        ...clone(state.projectData),
        ...clone(nextPayload as Record<string, unknown>)
      };
      return clone(state.projectData);
    },
    attachTerminal(terminalId: string) {
      const session = state.terminalSessions.find((item: FixtureState) => item.terminalId === terminalId);
      if (!session) {
        throw new Error('terminal_not_found');
      }
      return clone({ session, snapshot: session.snapshot });
    },
    listTerminalSessions() {
      return clone(state.terminalSessions);
    },
    getTerminalSession() {
      return clone(state.terminalSessions[0]);
    }
  };
};
