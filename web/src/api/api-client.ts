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
  /** Present when served from persisted workspace roster. */
  meta?: { version?: number; workspaceId?: string; storage?: string };
};

export type CreateMemberInput = {
  memberId: string;
  displayName?: string;
  avatar?: string;
  roleType?: string;
  manualStatus?: string;
  terminalStatus?: string;
  createRuntime?: boolean;
  providerId?: string;
  terminalType?: string;
  agentType?: string;
  command?: string;
  workingDir?: string;
  team?: string;
  teamId?: string;
};

export type UpdateMemberInput = Partial<Pick<CreateMemberInput, 'displayName' | 'avatar' | 'roleType' | 'manualStatus' | 'terminalStatus'>>;

export type CreateTeamInput = {
  teamId: string;
  name?: string;
  memberIds?: string[];
};

export type UpdateTeamInput = {
  name?: string;
  memberIds?: string[];
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
  /** Present for team-scoped threads. */
  teamId?: string | null;
  /** Participants for direct / channel threads. */
  memberIds?: string[];
};

export type CreateConversationInput = {
  type: 'direct' | 'team';
  memberId?: string;
  teamId?: string;
};

export type CreateConversationResponse = {
  conversation: ChatConversation;
};

export type ChatAttachment = {
  kind?: 'image' | 'file';
  name?: string;
  mimeType?: string;
  size?: number;
  /** data: URL (demo / dev); production would use object storage URLs. */
  dataUrl?: string;
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
  attachments?: ChatAttachment[];
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
  attachments?: ChatAttachment[];
};

export type ApiClient = {
  getWorkspaceSummary: () => Promise<WorkspaceSummary>;
  getConversations: () => Promise<ChatConversationsResponse>;
  /** Create or return an existing DM / team thread (server-dependent). */
  createConversation: (body: CreateConversationInput) => Promise<CreateConversationResponse>;
  getMessages: (conversationId: string) => Promise<ChatMessagePageResponse>;
  sendMessage: (conversationId: string, payload: SendChatMessageInput) => Promise<{ message?: ChatMessage }>;
  getMembers: () => Promise<MembersResponse>;
  createMember: (body: CreateMemberInput) => Promise<MembersResponse>;
  updateMember: (memberId: string, body: UpdateMemberInput) => Promise<MembersResponse>;
  deleteMember: (memberId: string) => Promise<MembersResponse>;
  createTeam: (body: CreateTeamInput) => Promise<MembersResponse>;
  updateTeam: (teamId: string, body: UpdateTeamInput) => Promise<MembersResponse>;
  deleteTeam: (teamId: string) => Promise<MembersResponse>;
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

  // ── Phase 1: Message pipeline ──
  listMessages?: (params: { conversationId?: string; workspaceId?: string; limit?: number; beforeId?: string }) => Promise<{ items: ChatMessage[]; nextBeforeId: string | null }>;
  sendPipelineMessage?: (input: { workspaceId: string; conversationId: string; senderId: string; content: { type: string; text: string }; isAi?: boolean }) => Promise<ChatMessage>;
  markMessagesRead?: (workspaceId: string, conversationId: string, memberId: string, lastReadId: string) => Promise<{ unreadCount: number }>;

  // ── Phase 5: Presence ──
  setPresenceStatus?: (workspaceId: string, memberId: string, status: string) => Promise<void>;
  sendPresenceHeartbeat?: (workspaceId: string, memberId: string) => Promise<void>;
  listOnlineMembers?: (workspaceId: string) => Promise<{ members: Array<{ memberId: string; status: string; terminalStatus: string; lastSeenAt: string }> }>;

  // ── Phase 8: Plugins ──
  listPlugins?: () => Promise<{ items: Array<{ id: string; name: string; description: string; category: string; version: string; rating: string; icon: string; installed: boolean }> }>;
  listInstalledPlugins?: () => Promise<{ items: Array<{ id: string; name: string; installed: boolean }> }>;
  installPlugin?: (pluginId: string) => Promise<unknown>;
  removePlugin?: (pluginId: string) => Promise<void>;
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
    createConversation: (body: CreateConversationInput) =>
      httpClient.post<CreateConversationResponse>(`${prefix}/conversations`, body),
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
    createMember: (body) => httpClient.post<MembersResponse>(`${prefix}/members`, body),
    updateMember: (memberId, body) =>
      httpClient.request<MembersResponse>(`${prefix}/members/${encodeURIComponent(memberId)}`, { method: 'PUT', body }),
    deleteMember: (memberId) =>
      httpClient.request<MembersResponse>(`${prefix}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }),
    createTeam: (body) => httpClient.post<MembersResponse>(`${prefix}/teams`, body),
    updateTeam: (teamId, body) =>
      httpClient.request<MembersResponse>(`${prefix}/teams/${encodeURIComponent(teamId)}`, { method: 'PUT', body }),
    deleteTeam: (teamId) =>
      httpClient.request<MembersResponse>(`${prefix}/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' }),
    getRoadmap: () => httpClient.get<RoadmapDocumentResponse>(roadmapPath),
    getRoadmapDocument: () => httpClient.get<RoadmapDocumentResponse>(roadmapPath),
    updateRoadmapDocument: (payload) => httpClient.request<RoadmapDocumentResponse>(roadmapPath, { method: 'PUT', body: payload }),
    getProjectDataDocument: () => httpClient.get<ProjectDataDocumentResponse>(projectDataPath),
    updateProjectDataDocument: (payload) =>
      httpClient.request<ProjectDataDocumentResponse>(projectDataPath, { method: 'PUT', body: payload }),
    attachTerminalSession: (sessionId) =>
      httpClient.post(`terminal/sessions/${encodeURIComponent(sessionId)}/attach`, {
        subscriberId: `web_${httpClient.workspaceId}_${Date.now()}`
      }),
    attachTerminal: (terminalId: string) =>
      httpClient.post(`terminal/sessions/${encodeURIComponent(terminalId)}/attach`, {
        subscriberId: `web_${httpClient.workspaceId}_${Date.now()}`
      }),

    // ── Phase 1: Message pipeline ──
    listMessages: async (params) => {
      const qs = new URLSearchParams();
      if (params.conversationId) qs.set('conversationId', params.conversationId);
      if (params.workspaceId) qs.set('workspaceId', params.workspaceId);
      if (params.limit) qs.set('limit', String(params.limit));
      if (params.beforeId) qs.set('beforeId', params.beforeId);
      return httpClient.get(`messages?${qs.toString()}`);
    },
    sendPipelineMessage: (input) => httpClient.post('messages', input),
    markMessagesRead: (workspaceId, conversationId, memberId, lastReadId) =>
      httpClient.post('messages/read', { workspaceId, conversationId, memberId, lastReadId }),

    // ── Phase 5: Presence ──
    setPresenceStatus: (workspaceId, memberId, status) =>
      httpClient.request('presence/status', { method: 'PUT', body: { workspaceId, memberId, status } }),
    sendPresenceHeartbeat: (workspaceId, memberId) =>
      httpClient.post('presence/heartbeat', { workspaceId, memberId }),
    listOnlineMembers: (workspaceId) =>
      httpClient.get(`presence/online?workspaceId=${encodeURIComponent(workspaceId)}`),

    // ── Phase 8: Plugins ──
    listPlugins: () => httpClient.get('plugins'),
    listInstalledPlugins: () => httpClient.get('plugins/installed'),
    installPlugin: (pluginId) => httpClient.post(`plugins/${encodeURIComponent(pluginId)}/install`),
    removePlugin: (pluginId) => httpClient.request(`plugins/${encodeURIComponent(pluginId)}`, { method: 'DELETE' })
  };
};
