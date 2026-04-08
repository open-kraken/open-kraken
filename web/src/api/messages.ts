/**
 * Phase 1: Message API client.
 */
import type { HttpClient } from './http-client';

export type MessageContentDTO = {
  type: string;
  text: string;
};

export type MessageTerminalDTO = {
  terminalId?: string;
  source?: string;
  command?: string;
  lineCount?: number;
};

export type MessageDTO = {
  id: string;
  workspaceId: string;
  conversationId: string;
  senderId: string;
  content: MessageContentDTO;
  status: string;
  isAi: boolean;
  seq: number;
  terminal?: MessageTerminalDTO;
  createdAt: string;
};

export type MessageListResponse = {
  items: MessageDTO[];
  nextBeforeId: string | null;
};

export type SendMessageInput = {
  workspaceId: string;
  conversationId: string;
  senderId: string;
  content: MessageContentDTO;
  isAi?: boolean;
  terminal?: MessageTerminalDTO;
};

export const createMessageApi = (http: HttpClient) => ({
  list: (params: { conversationId?: string; workspaceId?: string; limit?: number; beforeId?: string }) => {
    const qs = new URLSearchParams();
    if (params.conversationId) qs.set('conversationId', params.conversationId);
    if (params.workspaceId) qs.set('workspaceId', params.workspaceId);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.beforeId) qs.set('beforeId', params.beforeId);
    return http.get<MessageListResponse>(`messages?${qs.toString()}`);
  },
  send: (input: SendMessageInput) => http.post<MessageDTO>('messages', input),
  get: (id: string) => http.get<MessageDTO>(`messages/${id}`),
  updateStatus: (id: string, status: string) =>
    http.request<void>(`messages/${id}/status`, { method: 'PUT', body: { status } }),
  markRead: (workspaceId: string, conversationId: string, memberId: string, lastReadId: string) =>
    http.post<{ unreadCount: number }>('messages/read', {
      workspaceId,
      conversationId,
      memberId,
      lastReadId,
    }),
});
