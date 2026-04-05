import type { HttpClient } from '@/api/http-client';
import type { MemberFixture, RoadmapTaskFixture } from '@/features/members/member-page-model';

export type WorkspaceSummary = {
  workspaceId: string;
  membersOnline: number;
  activeConversationId: string;
};

export type MembersResponse = {
  members: MemberFixture[];
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
  getRoadmap: () => Promise<RoadmapResponse>;
  getRoadmapDocument: () => Promise<RoadmapDocumentResponse>;
  updateRoadmapDocument: (payload: { readOnly: boolean; roadmap: RoadmapDocumentResponse['roadmap'] }) => Promise<RoadmapDocumentResponse>;
  getProjectDataDocument: () => Promise<ProjectDataDocumentResponse>;
  updateProjectDataDocument: (payload: { readOnly: boolean; payload: Record<string, unknown> }) => Promise<ProjectDataDocumentResponse>;
  attachTerminalSession: (sessionId: string) => Promise<unknown>;
  attachTerminal?: (terminalId: string) => Promise<unknown>;
  subscribe?: (listener: (event: unknown) => void) => () => void;
};

export const createApiClient = (httpClient: HttpClient): ApiClient => {
  return {
    getWorkspaceSummary: () => httpClient.get<WorkspaceSummary>('/api/workspaces/current/summary'),
    getConversations: () =>
      httpClient.get<ChatConversationsResponse>('/api/v1/workspaces/ws_open_kraken/conversations'),
    getMessages: (conversationId) =>
      httpClient.get<ChatMessagePageResponse>(`/api/v1/workspaces/ws_open_kraken/conversations/${conversationId}/messages`),
    sendMessage: (conversationId, payload) =>
      httpClient.post(`/api/v1/workspaces/ws_open_kraken/conversations/${conversationId}/messages`, payload),
    getMembers: () => httpClient.get('/api/workspaces/current/members'),
    getRoadmap: () => httpClient.get('/api/workspaces/current/roadmap'),
    getRoadmapDocument: () => httpClient.get('/api/v1/workspaces/ws_open_kraken/roadmap'),
    updateRoadmapDocument: (payload) => httpClient.request('/api/v1/workspaces/ws_open_kraken/roadmap', { method: 'PUT', body: payload }),
    getProjectDataDocument: () => httpClient.get('/api/v1/workspaces/ws_open_kraken/project-data'),
    updateProjectDataDocument: (payload) =>
      httpClient.request('/api/v1/workspaces/ws_open_kraken/project-data', { method: 'PUT', body: payload }),
    attachTerminalSession: (sessionId) => httpClient.post(`/api/workspaces/current/terminal/sessions/${sessionId}/attach`)
  };
};
