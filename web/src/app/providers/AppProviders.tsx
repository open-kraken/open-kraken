import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient as createLegacyApiClient } from '@/api/create-client';
import { appEnv, resolveBrowserApiBaseUrl, resolveBrowserWsBaseUrl } from '@/config/env';
import { createApiClient } from '@/api/api-client';
import { bindHttpClient } from '@/api/http-binding';
import { HttpClient, HttpClientError } from '@/api/http-client';
import { RealtimeClient } from '@/realtime/realtime-client';
import { AppShellContext, type RealtimeStatusValue, type ShellToast } from '@/state/app-shell-store';
import { MESSAGES } from '@/i18n/messages';
import { readStoredLocale } from '@/i18n/locale-storage';
import { appRoutes, resolveAppRoute, type AppRouteId } from '@/routes';
import { useAuth } from '@/auth/AuthProvider';
import { installKeyboardListener } from '@/shared/keyboard/controller';
import { registerDefaultKeybinds } from '@/shared/keyboard/defaults';
import { useNotificationRealtime } from '@/features/notifications/useNotificationRealtime';

const tr = (key: string) => {
  const loc = readStoredLocale();
  return MESSAGES[loc][key] ?? MESSAGES.en[key] ?? key;
};

const defaultPath = '/chat';

const normalizePathname = (pathname: string) => {
  const resolvedRoute = resolveAppRoute(pathname);
  return resolvedRoute.path;
};

const createPathNavigator = (path: string) => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const initialRealtimeStatus: RealtimeStatusValue = {
  status: 'idle',
  detail: 'Realtime disconnected',
  lastCursor: null
};

export const AppProviders = ({ children }: PropsWithChildren) => {
  const { token: authToken, account } = useAuth();
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname || defaultPath));
  const [notifications, setNotifications] = useState<ShellToast[]>([]);
  const [realtime, setRealtime] = useState<RealtimeStatusValue>(initialRealtimeStatus);
  const [workspace, setWorkspace] = useState({
    workspaceId: appEnv.defaultWorkspaceId,
    workspaceLabel: tr('workspace.migrationLabel'),
    membersOnline: 0,
    activeConversationId: null as string | null
  });

  const httpClient = useMemo(() => {
    return new HttpClient({
      baseUrl: resolveBrowserApiBaseUrl(),
      workspaceId: appEnv.defaultWorkspaceId,
      authToken: authToken ?? undefined
    });
  }, [authToken]);

  useEffect(() => {
    bindHttpClient(httpClient);
  }, [httpClient]);

  const apiClient = useMemo(() => {
    const legacyClient = createLegacyApiClient({
      env: {
        OPEN_KRAKEN_API_BASE_URL: resolveBrowserApiBaseUrl(),
        OPEN_KRAKEN_WS_BASE_URL: resolveBrowserWsBaseUrl(),
        OPEN_KRAKEN_WORKSPACE_ID: appEnv.defaultWorkspaceId
      }
    }) as Record<string, unknown>;

    return {
      ...legacyClient,
      ...createApiClient(httpClient)
    };
  }, [httpClient]);

  const realtimeClient = useMemo(() => {
    return new RealtimeClient({
      open: (cursor) => {
        setRealtime({
          status: cursor ? 'reconnecting' : 'connecting',
          detail: cursor ? `Reconnected from ${cursor}` : 'Connected to workspace stream',
          lastCursor: cursor
        });
      },
      close: () => {
        setRealtime({
          status: 'disconnected',
          detail: 'Realtime disconnected',
          lastCursor: null
        });
      }
    });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const nextPath = normalizePathname(window.location.pathname || defaultPath);
      if (nextPath !== window.location.pathname) {
        window.history.replaceState({}, '', nextPath);
      }
      setPathname(nextPath);
    };

    if (window.location.pathname !== pathname) {
      window.history.replaceState({}, '', pathname);
    }

    window.addEventListener('popstate', onPopState);
    realtimeClient.connect();
    setRealtime({
      status: realtimeClient.getStatus(),
      detail: 'Connected to workspace stream',
      lastCursor: realtimeClient.getCursor()
    });

    return () => {
      window.removeEventListener('popstate', onPopState);
      realtimeClient.disconnect();
    };
  }, [pathname, realtimeClient]);

  // ── Notification realtime subscriptions (Phase 6) ──
  const { notificationState: chatNotifications, markAllRead: markAllChatRead, markConversationRead: markChatConversationRead } =
    useNotificationRealtime(realtimeClient, appEnv.defaultWorkspaceId);

  // ── Presence heartbeat: keep current user online (30s interval) ──
  useEffect(() => {
    const wsId = appEnv.defaultWorkspaceId;
    const memberId = account?.memberId;
    if (!memberId) return;

    const beat = () => {
      void apiClient.sendPresenceHeartbeat?.(wsId, memberId).catch(() => {/* ignore */});
    };
    beat(); // immediate
    const id = window.setInterval(beat, 30_000);
    return () => window.clearInterval(id);
  }, [apiClient, account]);

  // ── Global keyboard shortcut listener + default keybinds ──
  const navigateRef = useRef<(routeId: AppRouteId, options?: { hash?: string }) => void>(() => {});
  const toggleThemeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const cleanupListener = installKeyboardListener();
    const cleanupDefaults = registerDefaultKeybinds({
      navigateToChat: () => navigateRef.current('chat'),
      navigateToTerminal: () => navigateRef.current('terminal'),
      navigateToSettings: () => navigateRef.current('settings'),
      toggleTheme: () => toggleThemeRef.current(),
    });
    return () => { cleanupListener(); cleanupDefaults(); };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void apiClient
      .getWorkspaceSummary()
      .then((summary) => {
        if (cancelled) {
          return;
        }
        setWorkspace({
          workspaceId: summary.workspaceId,
          workspaceLabel: tr('workspace.labelWithId').replace('{id}', summary.workspaceId),
          membersOnline: summary.membersOnline,
          activeConversationId: summary.activeConversationId
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const detail =
          error instanceof HttpClientError
            ? `${error.envelope.code} (${error.envelope.requestId})`
            : tr('workspace.summaryFallback');
        setNotifications((current) => [
          ...current,
          {
            id: `toast_${Math.random().toString(36).slice(2, 10)}`,
            tone: 'warning',
            title: tr('workspace.summaryUnavailable'),
            detail
          }
        ]);
      });

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const contextValue = useMemo(() => {
    const route = resolveAppRoute(pathname);

    return {
      route,
      routes: appRoutes,
      workspace,
      notifications,
      realtime,
      navigate: (routeId: AppRouteId, options?: { hash?: string }) => {
        const targetRoute = appRoutes.find((candidate) => candidate.id === routeId);
        if (!targetRoute) {
          return;
        }
        const hash = options?.hash?.replace(/^#/, '') ?? '';
        const path = hash ? `${targetRoute.path}#${hash}` : targetRoute.path;
        createPathNavigator(path);
      },
      pushNotification: (toast: Omit<ShellToast, 'id'>) => {
        const nextToast: ShellToast = {
          id: `toast_${Math.random().toString(36).slice(2, 10)}`,
          ...toast
        };
        setNotifications((current) => [...current, nextToast]);
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setNotifications((current) => current.filter((t) => t.id !== nextToast.id));
        }, 5000);
      },
      dismissNotification: (toastId: string) => {
        setNotifications((current) => current.filter((toast) => toast.id !== toastId));
      },
      apiClient,
      realtimeClient,

      // Phase 6: chat notification aggregation.
      chatNotifications,
      markAllChatRead,
      markChatConversationRead
    };
  }, [apiClient, notifications, pathname, realtime, realtimeClient, workspace, chatNotifications, markAllChatRead, markChatConversationRead]);

  // Keep refs updated so keyboard shortcuts use the latest navigate/toggleTheme.
  useEffect(() => {
    navigateRef.current = contextValue.navigate;
  }, [contextValue.navigate]);

  return <AppShellContext.Provider value={contextValue}>{children}</AppShellContext.Provider>;
};
