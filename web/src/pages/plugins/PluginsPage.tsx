import { useCallback, useEffect, useState } from 'react';
import { useAppShell } from '@/state/app-shell-store';
import type { PluginDTO } from '@/api/plugins';
import { createPluginApi } from '@/api/plugins';
import { getHttpClient } from '@/api/http-binding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Star } from 'lucide-react';

export const PluginsPage = () => {
  const { pushNotification } = useAppShell();
  const [view, setView] = useState<'browse' | 'installed'>('browse');
  const [category, setCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [available, setAvailable] = useState<PluginDTO[]>([]);
  const [installed, setInstalled] = useState<PluginDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const pluginApi = createPluginApi(getHttpClient());

  const categories = [
    'all',
    'development',
    'productivity',
    'design',
    'communication',
    'observability',
  ];

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [avail, inst] = await Promise.all([
        pluginApi.listAvailable(),
        pluginApi.listInstalled(),
      ]);
      setAvailable(avail.items);
      setInstalled(inst.items);
    } catch {
      pushNotification({
        tone: 'error',
        title: 'Plugin load failed',
        detail: 'Could not load plugin catalog.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const allPlugins = [...available, ...installed.filter((ip) => !available.some((ap) => ap.id === ip.id))];

  const filteredPlugins = allPlugins.filter((p) => {
    const isInstalled = installed.some((ip) => ip.id === p.id);
    const matchesView = view === 'browse' ? true : isInstalled;
    const matchesCategory =
      category === 'all' || ('category' in p && (p as Record<string, unknown>).category === category);
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesView && matchesCategory && matchesSearch;
  });

  const installedCount = installed.length;

  const handleInstall = async (pluginId: string) => {
    try {
      await pluginApi.install(pluginId);
      pushNotification({
        tone: 'info',
        title: 'Plugin installed',
        detail: `${pluginId} has been installed.`,
      });
      void refresh();
    } catch {
      pushNotification({
        tone: 'error',
        title: 'Install failed',
        detail: `Could not install ${pluginId}.`,
      });
    }
  };

  const handleRemove = async (pluginId: string) => {
    try {
      await pluginApi.remove(pluginId);
      pushNotification({
        tone: 'info',
        title: 'Plugin removed',
        detail: `${pluginId} has been removed.`,
      });
      void refresh();
    } catch {
      pushNotification({
        tone: 'error',
        title: 'Remove failed',
        detail: `Could not remove ${pluginId}.`,
      });
    }
  };

  const isInstalled = (pluginId: string) => installed.some((ip) => ip.id === pluginId);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="app-surface-strong border-b app-border-subtle p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold app-text-strong">Plugins</h1>
          <div className="relative w-72">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint"
            />
            <Input
              placeholder="Search plugins..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as 'browse' | 'installed')}>
          <TabsList>
            <TabsTrigger value="browse">Browse Store</TabsTrigger>
            <TabsTrigger value="installed">My Plugins ({installedCount})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Categories */}
      <div className="app-surface-strong border-b app-border-subtle px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory(cat)}
              className={category === cat ? 'app-accent-bg hover:opacity-90 text-white' : ''}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Plugins Grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="app-text-muted">Loading plugins...</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlugins.map((plugin) => (
              <Card key={plugin.id} className="kraken-card p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {plugin.name.charAt(0).toUpperCase()}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {('category' in plugin && (plugin as Record<string, unknown>).category as string) || 'plugin'}
                  </Badge>
                </div>

                <h3 className="font-semibold app-text-strong mb-2">{plugin.name}</h3>
                <p className="text-sm app-text-muted mb-3">{plugin.description}</p>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-500 fill-yellow-500" />
                    <span className="text-sm font-medium app-text-strong">
                      {('rating' in plugin && (plugin as Record<string, unknown>).rating as number) || '--'}
                    </span>
                  </div>
                  <span className="text-xs app-text-faint">
                    v{('version' in plugin && (plugin as Record<string, unknown>).version as string) || '1.0'}
                  </span>
                </div>

                {isInstalled(plugin.id) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void handleRemove(plugin.id)}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full app-accent-bg hover:opacity-90 text-white"
                    onClick={() => void handleInstall(plugin.id)}
                  >
                    Install
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}

        {!loading && filteredPlugins.length === 0 && (
          <div className="text-center py-12">
            <p className="app-text-muted">No plugins found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};
