import { createContext, useContext } from 'react';
import type { ApiClient } from '@/api/api-client';
import type { RealtimeClient } from '@/realtime/realtime-client';
import type { AppRouteDefinition, AppRouteId } from '@/routes';

export type ToastTone = 'info' | 'warning' | 'error';

export type ShellToast = {
  id: string;
  tone: ToastTone;
  title: string;
  detail: string;
  /** Stable id for logic (e.g. clear error state); not shown in UI. */
  tag?: string;
};

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stale' | 'disconnected';

export type WorkspaceContextValue = {
  workspaceId: string;
  workspaceLabel: string;
  membersOnline?: number;
  activeConversationId?: string | null;
};

export type RealtimeStatusValue = {
  status: RealtimeStatus;
  detail: string;
  lastCursor: string | null;
};

export type AppShellContextValue = {
  route: AppRouteDefinition;
  routes: AppRouteDefinition[];
  workspace: WorkspaceContextValue;
  notifications: ShellToast[];
  realtime: RealtimeStatusValue;
  apiClient: ApiClient;
  realtimeClient: RealtimeClient;
  navigate: (routeId: AppRouteId, options?: { hash?: string }) => void;
  pushNotification: (toast: Omit<ShellToast, 'id'>) => void;
  dismissNotification: (toastId: string) => void;
};

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export const useAppShell = () => {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('app_shell_context_missing');
  }
  return context;
};
