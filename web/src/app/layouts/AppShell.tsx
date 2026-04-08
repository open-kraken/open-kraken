import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { appNavGroups, appRoutes, type AppRouteId } from '@/routes';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorBoundary } from '@/components/shell/ErrorBoundary';
import { NavRouteIcon } from '@/components/shell/NavRouteIcon';
import { getNodes } from '@/api/nodes';
import type { AuthAccount } from '@/auth/auth-types';
import { ContextMenuHost } from '@/shared/context-menu/ContextMenuHost';
import { NotificationBadge } from '@/features/notifications/NotificationBadge';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { SkeletonPage } from '@/components/ui/Skeleton';
import { OnboardingOverlay } from '@/components/ui/OnboardingOverlay';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PixelAvatar } from '@/components/ui/pixel-avatar';
import {
  Search,
  Bell,
  Moon,
  Sun,
  LogOut,
  UserCog,
  Settings,
  Maximize,
  Minimize,
} from 'lucide-react';

const ChatPage = lazy(() => import('@/pages/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const MembersPage = lazy(() => import('@/pages/members/MembersPage').then((m) => ({ default: m.MembersPage })));
const SkillsPage = lazy(() => import('@/pages/skills/SkillsPage').then((m) => ({ default: m.SkillsPage })));
const TaskMapPage = lazy(() => import('@/pages/taskmap/TaskMapPage').then((m) => ({ default: m.TaskMapPage })));
const RoadmapPage = lazy(() => import('@/pages/roadmap/RoadmapPage').then((m) => ({ default: m.RoadmapPage })));
const TerminalPage = lazy(() => import('@/pages/terminal/TerminalPage').then((m) => ({ default: m.TerminalPage })));
const ApprovalsPage = lazy(() => import('@/pages/approvals/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })));
const WorkspacesPage = lazy(() => import('@/pages/workspaces/WorkspacesPage').then((m) => ({ default: m.WorkspacesPage })));
const RepositoriesPage = lazy(() => import('@/pages/repositories/RepositoriesPage').then((m) => ({ default: m.RepositoriesPage })));
const NamespacesPage = lazy(() => import('@/pages/namespaces/NamespacesPage').then((m) => ({ default: m.NamespacesPage })));
const ArtifactsPage = lazy(() => import('@/pages/artifacts/ArtifactsPage').then((m) => ({ default: m.ArtifactsPage })));
const SystemPage = lazy(() => import('@/pages/system/SystemPage').then((m) => ({ default: m.SystemPage })));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NodesPage = lazy(() => import('@/pages/nodes/NodesPage').then((m) => ({ default: m.NodesPage })));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LedgerPage = lazy(() => import('@/pages/ledger/LedgerPage').then((m) => ({ default: m.LedgerPage })));
const PluginsPage = lazy(() => import('@/pages/plugins/PluginsPage').then((m) => ({ default: m.PluginsPage })));
const AccountPage = lazy(() => import('@/pages/account/AccountPage').then((m) => ({ default: m.AccountPage })));

const pageByRoute = {
  dashboard: DashboardPage,
  ledger: LedgerPage,
  chat: ChatPage,
  members: MembersPage,
  skills: SkillsPage,
  taskmap: TaskMapPage,
  roadmap: RoadmapPage,
  terminal: TerminalPage,
  approvals: ApprovalsPage,
  workspaces: WorkspacesPage,
  repositories: RepositoriesPage,
  namespaces: NamespacesPage,
  artifacts: ArtifactsPage,
  system: SystemPage,
  settings: SettingsPage,
  nodes: NodesPage,
  plugins: PluginsPage,
  account: AccountPage
};

type ClusterSummary = { total: number; online: number; degraded: number; offline: number };

type SignalLevel = 0 | 1 | 2 | 3 | 4;

const latencyToSignal = (ms: number | null): SignalLevel => {
  if (ms === null) return 0;
  if (ms < 80) return 4;
  if (ms < 200) return 3;
  if (ms < 500) return 2;
  return 1;
};

const signalTone = (level: SignalLevel): 'ok' | 'warn' | 'bad' => {
  if (level >= 3) return 'ok';
  if (level === 2) return 'warn';
  return 'bad';
};

const SignalBars = ({ level }: { level: SignalLevel }) => {
  const barHeights = [4, 7, 10, 13];
  const tone = signalTone(level);
  const toneColor = tone === 'ok' ? '#22c55e' : tone === 'warn' ? '#eab308' : '#ef4444';
  return (
    <svg width="14" height="12" viewBox="0 0 16 14" fill="none" role="img" aria-label={`Signal ${level}/4`}>
      {barHeights.map((h, i) => (
        <rect
          key={i}
          x={i * 4}
          y={14 - h}
          width="3"
          height={h}
          rx="0.5"
          fill={i < level ? toneColor : '#d1d5db'}
        />
      ))}
    </svg>
  );
};

const shellAvatarName = (account: AuthAccount) => {
  return account.displayName.trim() || account.memberId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'User';
};

export const AppShell = () => {
  const { t } = useI18n();
  const { route, workspace, notifications, realtime, navigate, dismissNotification, chatNotifications } = useAppShell();
  const { account, logout } = useAuth();
  const ActivePage = pageByRoute[route.id];

  // ── Theme ──
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('kraken-theme', next);
    setIsDark(!isDark);
  }, [isDark]);

  // ── Command Palette ──
  const [cmdOpen, setCmdOpen] = useState(false);
  const commandItems: CommandItem[] = appRoutes.map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
    group: 'Navigation',
    handler: () => navigate(r.id),
  }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleTheme]);

  // ── Offline detection ──
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const onOff = () => setOffline(true);
    const onOn = () => setOffline(false);
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onOn);
    return () => { window.removeEventListener('offline', onOff); window.removeEventListener('online', onOn); };
  }, []);

  const routeLabel = (routeId: AppRouteId) => t(`routes.${routeId}.label`);

  // ── Fullscreen mode ──
  const [isFullscreen, setIsFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const el = shellRef.current ?? document.documentElement;
      void el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      void document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleFullscreen]);

  // ── Cluster / latency ──
  const [cluster, setCluster] = useState<ClusterSummary | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const refreshCluster = useCallback(() => {
    const start = performance.now();
    void getNodes()
      .then(({ nodes }) => {
        setLatencyMs(Math.round(performance.now() - start));
        setCluster({
          total: nodes.length,
          online: nodes.filter((n) => n.status === 'online').length,
          degraded: nodes.filter((n) => n.status === 'degraded').length,
          offline: nodes.filter((n) => n.status === 'offline').length
        });
      })
      .catch(() => {
        setCluster(null);
        setLatencyMs(null);
      });
  }, []);

  useEffect(() => {
    refreshCluster();
    const id = window.setInterval(refreshCluster, 15000);
    return () => window.clearInterval(id);
  }, [refreshCluster]);

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.closest('[data-nav-area]')) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [route.id]);

  const userName = account ? shellAvatarName(account) : 'User';

  return (
    <div className="flex h-screen app-bg-canvas" data-shell-route={route.id} ref={shellRef}>
      {/* Sidebar */}
      <aside className="nav-sidebar flex flex-col">
        <div className="p-4 border-b app-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
              K
            </div>
            <div>
              <div className="font-bold app-text-strong text-sm">{t('shell.brand')}</div>
              <div className="text-[10px] app-text-faint">{t('shell.console')}</div>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <nav className="p-3" data-nav-area>
            {appNavGroups.map((group) => (
              <div key={group.id} className="nav-section">
                <div className="nav-section-label">{t(`navGroups.${group.id}`)}</div>
                {group.routeIds.map((routeId) => {
                  const isActive = routeId === route.id;
                  return (
                    <button
                      key={routeId}
                      type="button"
                      className={`nav-item w-full ${isActive ? 'active' : ''}`}
                      onClick={() => navigate(routeId)}
                    >
                      <NavRouteIcon routeId={routeId} />
                      <span>{routeLabel(routeId)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 app-surface-strong border-b app-border-subtle px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold app-text-strong">{workspace.workspaceLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative" onClick={() => setCmdOpen(true)}>
              <Search size={18} />
            </Button>

            <NotificationBadge count={chatNotifications.totalUnread} onClick={() => navigate('chat')} />

            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>

            <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </Button>

            {account && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 px-2">
                    <PixelAvatar name={userName} size="sm" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2 border-b">
                    <div className="flex items-center gap-2 mb-1">
                      <PixelAvatar name={userName} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{account.displayName}</div>
                        <div className="text-xs text-muted-foreground capitalize">{account.role ?? 'member'}</div>
                      </div>
                    </div>
                  </div>
                  <DropdownMenuItem onClick={() => navigate('account')}>
                    <UserCog size={14} className="mr-2" />
                    {t('routes.account.label')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('settings')}>
                    <Settings size={14} className="mr-2" />
                    {t('routes.settings.label')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600">
                    <LogOut size={14} className="mr-2" />
                    {t('shell.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Toast overlay */}
        {notifications.length > 0 && (
          <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 w-80">
            {notifications.map((toast) => (
              <div key={toast.id} className="bg-card border rounded-lg shadow-lg p-4 flex items-start gap-3">
                <div className="flex-1">
                  <strong className="text-sm font-semibold">{toast.title}</strong>
                  <p className="text-xs text-muted-foreground mt-0.5">{toast.detail}</p>
                </div>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => dismissNotification(toast.id)}>
                  {t('shell.dismiss')}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto" ref={mainRef} tabIndex={-1}>
          <ErrorBoundary key={route.id}>
            <Suspense fallback={<SkeletonPage />}>
              <ActivePage />
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Footer Status Bar */}
        <footer className="h-8 app-surface-strong border-t app-border-subtle px-4 flex items-center gap-4 text-[10px] app-text-faint">
          <span>{workspace.workspaceId}</span>
          <span>·</span>
          {cluster && (
            <>
              <span>
                {t('statusbar.clusterSummary', {
                  total: cluster.total,
                  online: cluster.online,
                  degraded: cluster.degraded,
                  offline: cluster.offline
                })}
              </span>
              <span>·</span>
            </>
          )}
          <span className="flex items-center gap-1">
            <SignalBars level={latencyToSignal(latencyMs)} />
            <span>{latencyMs !== null ? `${latencyMs}ms` : '—'}</span>
          </span>
        </footer>
      </div>

      <ContextMenuHost />
      <CommandPalette items={commandItems} open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <OnboardingOverlay />
      {offline && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Connection lost — retrying...
        </div>
      )}
    </div>
  );
};
