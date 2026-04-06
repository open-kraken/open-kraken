/**
 * API client for Terminal session management endpoints.
 * Paths are relative to VITE_API_BASE_URL (default …/api/v1).
 */

import { getHttpClient } from '@/api/http-binding';

export type TerminalSessionInfo = {
  terminalId: string;
  memberId: string;
  workspaceId: string;
  terminalType: string;
  command: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type TerminalSessionsResponse = { items: TerminalSessionInfo[] };

type SessionApi = {
  terminalId?: string;
  memberId?: string;
  workspaceId?: string;
  terminalType?: string;
  command?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

function mapSession(raw: SessionApi): TerminalSessionInfo {
  return {
    terminalId: String(raw.terminalId ?? ''),
    memberId: String(raw.memberId ?? ''),
    workspaceId: String(raw.workspaceId ?? ''),
    terminalType: String(raw.terminalType ?? ''),
    command: String(raw.command ?? ''),
    status: String(raw.status ?? 'unknown'),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? '')
  };
}

/** GET /terminal/sessions — list all sessions. */
export const listTerminalSessions = async (workspaceId: string): Promise<TerminalSessionsResponse> => {
  const http = getHttpClient();
  const body = await http.get<{ items?: SessionApi[] } | SessionApi[]>(
    `/terminal/sessions?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  const items = Array.isArray(body) ? body : (body.items ?? []);
  return { items: items.map(mapSession) };
};

/** POST /terminal/sessions/{sessionId}/input — send input to terminal. */
export const sendTerminalInput = async (sessionId: string, data: string): Promise<void> => {
  const http = getHttpClient();
  await http.post(`/terminal/sessions/${encodeURIComponent(sessionId)}/input`, { data });
};

/** POST /terminal/sessions/{sessionId}/dispatch — dispatch a context command. */
export const dispatchTerminalCommand = async (sessionId: string, data: string, context?: string): Promise<void> => {
  const http = getHttpClient();
  await http.post(`/terminal/sessions/${encodeURIComponent(sessionId)}/dispatch`, { data, context });
};

/** POST /terminal/sessions/{sessionId}/close — close a session. */
export const closeTerminalSession = async (sessionId: string): Promise<void> => {
  const http = getHttpClient();
  await http.post(`/terminal/sessions/${encodeURIComponent(sessionId)}/close`);
};
