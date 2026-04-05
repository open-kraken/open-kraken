import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { createApiClient as createLegacyApiClient } from '@/api/create-client.mjs';
import { appEnv } from '@/config/env';
import { createApiClient } from '@/api/api-client';
import { bindHttpClient } from '@/api/http-binding';
import { HttpClient, HttpClientError } from '@/api/http-client';
import { RealtimeClient } from '@/realtime/realtime-client';
import { AppShellContext, type RealtimeStatusValue, type ShellToast } from '@/state/app-shell-store';
import { I18nProvider } from '@/i18n/I18nProvider';
import { MESSAGES } from '@/i18n/messages';
import { readStoredLocale } from '@/i18n/locale-storage';
import { appRoutes, resolveAppRoute, type AppRouteId } from '@/routes';

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

const resolveApiBaseUrl = () => {
  const fromEnv = appEnv.apiBaseUrl;
  if (fromEnv !== 'http://127.0.0.1:8080/api/v1') {
    return fromEnv;
  }
  if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
    return `${window.location.origin}/api/v1`;
  }
  return fromEnv;
};

export const AppProviders = ({ children }: PropsWithChildren) => {
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
      baseUrl: resolveApiBaseUrl(),
      workspaceId: appEnv.defaultWorkspaceId
    });
  }, []);

  useEffect(() => {
    bindHttpClient(httpClient);
  }, [httpClient]);

  const apiClient = useMemo(() => {
    const legacyClient = createLegacyApiClient({
      env: {
        OPEN_KRAKEN_API_BASE_URL: appEnv.apiBaseUrl,
        OPEN_KRAKEN_WS_BASE_URL: appEnv.wsBaseUrl,
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
      },
      dismissNotification: (toastId: string) => {
        setNotifications((current) => current.filter((toast) => toast.id !== toastId));
      },
      apiClient,
      realtimeClient
    };
  }, [apiClient, notifications, pathname, realtime, realtimeClient, workspace]);

  return (
    <AppShellContext.Provider value={contextValue}>
      <I18nProvider>{children}</I18nProvider>
    </AppShellContext.Provider>
  );
};
