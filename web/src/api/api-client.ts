import type { HttpClient } from '@/api/http-client';
import type { MemberFixture, RoadmapTaskFixture } from '@/features/members/member-page-model';

export type WorkspaceSummary = {
  workspaceId: string;
  membersOnline: number;
  activeConversationId: string;
};

export type MembersResponse = {
  members: MemberFixture[];
  /**
   * Optional explicit teams (each with nested `members`). When present, the Team page groups roster by team.
   * Alternatively, use `teamId` on each `MemberFixture` plus optional metadata-only `teams` entries for names.
   */
  teams?: Array<{ teamId: string; name?: string; members: MemberFixture[] }>;
};

export type RoadmapResponse = {
  objective: string;
  tasks: RoadmapTaskFixture[];
};

export type RoadmapDocumentResponse = {
  readOnly?: boolean;
  storage?: 'workspace' | 'app' | 'none';
  warning?: string;
  readOnlyReason?: string | null;
  roadmap: {
    objective?: string;
    tasks?: Array<{
      id?: string;
      number?: number;
      order?: number;
      title?: string;
      status?: string;
      pinned?: boolean;
    }>;
  };
};

export type ProjectDataDocumentResponse = {
  readOnly?: boolean;
  storage?: 'workspace' | 'app' | 'none';
  warning?: string;
  readOnlyReason?: string | null;
  payload?: Record<string, unknown>;
};

export type ChatConversation = {
  id: string;
  type: string;
  customName?: string | null;
  lastMessagePreview?: string | null;
  unreadCount?: number;
  isDefault?: boolean;
};

export type ChatMessage = {
  id: string;
  senderId?: string | null;
  content?: {
    type?: string;
    text?: string;
  } | null;
  status?: string;
  createdAt?: number;
};

export type ChatConversationsResponse = {
  workspace: {
    id: string;
    name?: string;
  };
  conversations: ChatConversation[];
};

export type ChatMessagePageResponse = {
  items: ChatMessage[];
  nextBeforeId: string | null;
};

export type SendChatMessageInput = {
  senderId: string;
  content: {
    type: 'text';
    text: string;
  };
  isAI: boolean;
};

export type ApiClient = {
  getWorkspaceSummary: () => Promise<WorkspaceSummary>;
  getConversations: () => Promise<ChatConversationsResponse>;
  getMessages: (conversationId: string) => Promise<ChatMessagePageResponse>;
  sendMessage: (conversationId: string, payload: SendChatMessageInput) => Promise<unknown>;
  getMembers: () => Promise<MembersResponse>;
  /** Same payload as {@link getRoadmapDocument}; kept for callers that only need the roadmap envelope. */
  getRoadmap: () => Promise<RoadmapDocumentResponse>;
  getRoadmapDocument: () => Promise<RoadmapDocumentResponse>;
  updateRoadmapDocument: (payload: { readOnly: boolean; roadmap: RoadmapDocumentResponse['roadmap'] }) => Promise<RoadmapDocumentResponse>;
  getProjectDataDocument: () => Promise<ProjectDataDocumentResponse>;
  updateProjectDataDocument: (payload: { readOnly: boolean; payload: Record<string, unknown> }) => Promise<ProjectDataDocumentResponse>;
  /** Terminal attach for a session id (HTTP GET per workspace route handler). */
  attachTerminalSession: (sessionId: string) => Promise<unknown>;
  attachTerminal?: (terminalId: string) => Promise<unknown>;
  subscribe?: (listener: (event: unknown) => void) => () => void;
};

/**
 * HTTP API client. Paths are relative to {@link HttpClient} `baseUrl` (typically `…/api/v1`),
 * so all routes start with `/workspaces/{workspaceId}/…`.
 */
export const createApiClient = (httpClient: HttpClient): ApiClient => {
  const ws = encodeURIComponent(httpClient.workspaceId);
  const prefix = `/workspaces/${ws}`;

  const roadmapPath = `${prefix}/roadmap`;
  const projectDataPath = `${prefix}/project-data`;

  return {
    getWorkspaceSummary: async () => {
      const data = await httpClient.get<{
        workspace?: { id?: string };
        members?: Array<{ manualStatus?: string }>;
        defaultConversationId?: string;
      }>(`${prefix}/chat/home`);
      const members = data.members ?? [];
      const membersOnline = members.filter((m) => m.manualStatus === 'online').length;
      return {
        workspaceId: data.workspace?.id ?? httpClient.workspaceId,
        membersOnline,
        activeConversationId: data.defaultConversationId ?? ''
      };
    },
    getConversations: () => httpClient.get<ChatConversationsResponse>(`${prefix}/conversations`),
    getMessages: async (conversationId) => {
      const raw = await httpClient.get<{
        items?: ChatMessage[];
        nextBeforeId?: string | null;
        nextBefore?: string | null;
      }>(`${prefix}/conversations/${encodeURIComponent(conversationId)}/messages`);
      return {
        items: raw.items ?? [],
        nextBeforeId: raw.nextBeforeId ?? raw.nextBefore ?? null
      };
    },
    sendMessage: (conversationId, payload) =>
      httpClient.post(`${prefix}/conversations/${encodeURIComponent(conversationId)}/messages`, payload),
    getMembers: () => httpClient.get<MembersResponse>(`${prefix}/members`),
    getRoadmap: () => httpClient.get<RoadmapDocumentResponse>(roadmapPath),
    getRoadmapDocument: () => httpClient.get<RoadmapDocumentResponse>(roadmapPath),
    updateRoadmapDocument: (payload) => httpClient.request<RoadmapDocumentResponse>(roadmapPath, { method: 'PUT', body: payload }),
    getProjectDataDocument: () => httpClient.get<ProjectDataDocumentResponse>(projectDataPath),
    updateProjectDataDocument: (payload) =>
      httpClient.request<ProjectDataDocumentResponse>(projectDataPath, { method: 'PUT', body: payload }),
    attachTerminalSession: (sessionId) =>
      httpClient.get(`${prefix}/terminals/${encodeURIComponent(sessionId)}/attach`)
  };
};
