import { useCallback, useEffect, useState } from 'react';
import type { AppLocale } from '@/i18n/locale-storage';
import { APP_LOCALES } from '@/i18n/locale-storage';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell } from '@/state/app-shell-store';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { appEnv } from '@/config/env';
import { SettingsAccountSection } from '@/features/settings/SettingsAccountSection';
import { SettingsNotificationSection } from '@/features/settings/SettingsNotificationSection';
import { SettingsKeybindsSection } from '@/features/settings/SettingsKeybindsSection';
import { getHttpClient } from '@/api/http-binding';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink, CheckCircle } from 'lucide-react';

type ApiDiagResult = {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
};

type BackendSettings = {
  memberId: string;
  displayName?: string;
  avatar?: string;
  timezone?: string;
  browserNotifications?: boolean;
  soundEnabled?: boolean;
  dndStart?: string;
  dndEnd?: string;
};

export const SettingsPage = () => {
  const { t, locale, setLocale } = useI18n();
  const { notifications, pushNotification, realtime, workspace, navigate } = useAppShell();
  const { account } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [apiDiag, setApiDiag] = useState<ApiDiagResult | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [backendSettings, setBackendSettings] = useState<BackendSettings | null>(null);

  // Load settings from backend on mount.
  useEffect(() => {
    if (!account?.memberId) return;
    const http = getHttpClient();
    void http
      .get<BackendSettings>(`settings?memberId=${encodeURIComponent(account.memberId)}`)
      .then(setBackendSettings)
      .catch(() => {
        /* use defaults */
      });
  }, [account?.memberId]);

  const saveSettings = useCallback(
    async (patch: Partial<BackendSettings>) => {
      if (!account?.memberId) return;
      const http = getHttpClient();
      const merged = { ...backendSettings, ...patch, memberId: account.memberId };
      try {
        const saved = await http.request<BackendSettings>('settings', {
          method: 'PUT',
          body: merged,
        });
        setBackendSettings(saved);
      } catch {
        pushNotification({
          tone: 'error',
          title: 'Settings save failed',
          detail: 'Could not persist settings.',
        });
      }
    },
    [account?.memberId, backendSettings, pushNotification],
  );

  /** Ping the API healthz endpoint and measure latency. */
  const runApiDiagnostic = useCallback(async () => {
    setDiagRunning(true);
    const start = performance.now();
    try {
      const response = await fetch('/healthz', {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      const latencyMs = Math.round(performance.now() - start);
      setApiDiag({ ok: response.ok, status: response.status, latencyMs });
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      setApiDiag({
        ok: false,
        status: null,
        latencyMs,
        error: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setDiagRunning(false);
    }
  }, []);

  // Run diagnostic on mount
  useEffect(() => {
    void runApiDiagnostic();
  }, [runApiDiagnostic]);

  const shortcuts = [
    { combo: 'Cmd+K', description: 'Open command palette', scope: 'Global' },
    { combo: 'Cmd+1', description: 'Go to Chat', scope: 'Global' },
    { combo: 'Cmd+2', description: 'Go to Terminal', scope: 'Global' },
    { combo: 'Cmd+,', description: 'Open Settings', scope: 'Global' },
    { combo: 'Cmd+Shift+L', description: 'Toggle theme', scope: 'Global' },
    { combo: 'Cmd+Enter', description: 'Send message', scope: 'Chat' },
    { combo: 'Escape', description: 'Close modal/dialog', scope: 'Global' },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold app-text-strong mb-1">Settings</h1>
          <p className="text-sm app-text-muted">Manage your workspace preferences</p>
        </div>

        {/* Quick Links */}
        <div className="flex gap-2 mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate('dashboard')}>
            <ExternalLink size={14} className="mr-1" />
            Dashboard
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('ledger')}>
            <ExternalLink size={14} className="mr-1" />
            Ledger
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('nodes')}>
            <ExternalLink size={14} className="mr-1" />
            Nodes
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('skills')}>
            <ExternalLink size={14} className="mr-1" />
            Skills
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('system')}>
            <ExternalLink size={14} className="mr-1" />
            System
          </Button>
        </div>

        {/* Account Settings (persisted to backend) */}
        <SettingsAccountSection
          initial={{
            displayName: backendSettings?.displayName ?? account?.displayName ?? 'User',
            avatar: backendSettings?.avatar ?? account?.avatar ?? 'CO',
            timezone: backendSettings?.timezone ?? 'UTC',
          }}
          onSave={(s) => {
            void saveSettings({
              displayName: s.displayName,
              avatar: s.avatar,
              timezone: s.timezone,
            });
            pushNotification({
              tone: 'info',
              title: t('settings.accountSaved'),
              detail: `Display name: ${s.displayName}`,
            });
          }}
        />

        {/* Notification preferences (persisted to backend) */}
        <SettingsNotificationSection
          initial={{
            browserNotifications: backendSettings?.browserNotifications ?? false,
            soundEnabled: backendSettings?.soundEnabled ?? true,
            dndStart: backendSettings?.dndStart ?? '22:00',
            dndEnd: backendSettings?.dndEnd ?? '08:00',
          }}
          onSave={(s) => {
            void saveSettings({
              browserNotifications: s.browserNotifications,
              soundEnabled: s.soundEnabled,
              dndStart: s.dndStart,
              dndEnd: s.dndEnd,
            });
            pushNotification({
              tone: 'info',
              title: t('settings.notificationsSaved'),
              detail: `Browser: ${s.browserNotifications ? 'on' : 'off'}`,
            });
          }}
        />

        {/* Keyboard Shortcuts */}
        <Card className="p-6 mb-6">
          <h3 className="font-semibold app-text-strong mb-4">Keyboard Shortcuts</h3>
          <div className="space-y-2">
            {shortcuts.map((shortcut, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-2 border-b app-border-subtle last:border-0"
              >
                <div className="flex-1">
                  <div className="text-sm app-text-strong">{shortcut.description}</div>
                  <div className="text-xs app-text-faint">{shortcut.scope}</div>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {shortcut.combo}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Keybinds Section (Phase 9) */}
        <SettingsKeybindsSection />

        {/* Theme */}
        <Card className="p-6 mb-6">
          <h3 className="font-semibold app-text-strong mb-4">Appearance</h3>
          <div className="space-y-4">
            <div>
              <Label>Theme</Label>
              <p className="text-sm app-text-faint mb-2">Current: {theme || 'light'}</p>
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
              </Button>
            </div>

            <div>
              <Label htmlFor="language">Language</Label>
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as AppLocale)}
              >
                <SelectTrigger id="language" className="mt-1 max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_LOCALES.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {t(`settings.lang.${loc}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* API Diagnostics */}
        <Card className="p-6 mb-6">
          <h3 className="font-semibold app-text-strong mb-4">API Diagnostics</h3>
          <div className="flex items-start gap-4">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                apiDiag?.ok
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              <CheckCircle
                size={20}
                className={apiDiag?.ok ? 'text-green-600' : 'app-text-faint'}
              />
            </div>
            <div className="flex-1">
              <p className="text-sm app-text-strong mb-1">
                Status:{' '}
                {apiDiag
                  ? apiDiag.ok
                    ? `OK (${apiDiag.status})`
                    : apiDiag.error ?? `HTTP ${apiDiag.status}`
                  : 'Checking...'}
              </p>
              <p className="text-sm app-text-muted mb-3">
                Latency: {apiDiag ? `${apiDiag.latencyMs}ms` : '--'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runApiDiagnostic()}
                disabled={diagRunning}
              >
                {diagRunning ? 'Running...' : 'Run Again'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Workspace Info */}
        <Card className="p-6">
          <h3 className="font-semibold app-text-strong mb-4">Workspace</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="app-text-faint">Workspace ID:</span>
              <span className="font-mono app-text-strong">{workspace.workspaceId}</span>
            </div>
            <div className="flex justify-between">
              <span className="app-text-faint">Members Online:</span>
              <span className="app-text-strong">{workspace.membersOnline ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="app-text-faint">Connection:</span>
              <Badge
                variant="outline"
                className={
                  realtime.status === 'connected'
                    ? 'text-green-600 border-green-600'
                    : 'text-yellow-600 border-yellow-600'
                }
              >
                {realtime.status === 'connected' ? 'Connected' : realtime.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="app-text-faint">Cursor Realtime:</span>
              <span className="font-mono app-text-strong">
                {realtime.lastCursor ?? '--'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
