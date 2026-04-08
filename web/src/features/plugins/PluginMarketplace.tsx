/**
 * Phase 8: Plugin Marketplace — browse, install, and manage plugins.
 * Migrated from golutra's PluginMarketplace.vue.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PluginDTO } from '@/api/plugins';

type PluginMarketplaceProps = {
  available: PluginDTO[];
  installed: PluginDTO[];
  onInstall: (pluginId: string) => void;
  onRemove: (pluginId: string) => void;
  loading?: boolean;
};

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'development', label: 'Development' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'design', label: 'Design' },
  { key: 'communication', label: 'Communication' },
  { key: 'observability', label: 'Observability' },
];

export const PluginMarketplace = ({
  available,
  installed,
  onInstall,
  onRemove,
  loading,
}: PluginMarketplaceProps) => {
  const [tab, setTab] = useState<'browse' | 'installed'>('browse');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filteredAvailable = available.filter((p) => {
    if (category !== 'all' && p.category !== category) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const items = tab === 'browse' ? filteredAvailable : installed;

  return (
    <section className="plugin-marketplace" data-loading={loading}>
      <header className="plugin-marketplace__header">
        <div className="plugin-marketplace__tabs">
          <button
            type="button"
            className={`plugin-marketplace__tab ${tab === 'browse' ? 'plugin-marketplace__tab--active' : ''}`}
            onClick={() => setTab('browse')}
          >
            Browse Store
          </button>
          <button
            type="button"
            className={`plugin-marketplace__tab ${tab === 'installed' ? 'plugin-marketplace__tab--active' : ''}`}
            onClick={() => setTab('installed')}
          >
            My Plugins ({installed.length})
          </button>
        </div>
        {tab === 'browse' && (
          <input
            type="search"
            className="plugin-marketplace__search"
            placeholder="Search plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </header>

      {tab === 'browse' && (
        <nav className="plugin-marketplace__categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`plugin-marketplace__category ${category === cat.key ? 'plugin-marketplace__category--active' : ''}`}
              onClick={() => setCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </nav>
      )}

      <div className="plugin-marketplace__grid">
        {items.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            onInstall={() => onInstall(plugin.id)}
            onRemove={() => onRemove(plugin.id)}
          />
        ))}
        {items.length === 0 && (
          <p className="plugin-marketplace__empty">
            {tab === 'browse' ? 'No plugins match your search.' : 'No plugins installed.'}
          </p>
        )}
      </div>
    </section>
  );
};

type PluginCardProps = {
  plugin: PluginDTO;
  onInstall: () => void;
  onRemove: () => void;
};

const PluginCard = ({ plugin, onInstall, onRemove }: PluginCardProps) => (
  <div className="plugin-card">
    <div className="plugin-card__icon">{plugin.icon}</div>
    <div className="plugin-card__body">
      <h3 className="plugin-card__name">{plugin.name}</h3>
      <p className="plugin-card__desc">{plugin.description}</p>
      <div className="plugin-card__meta">
        <span className="plugin-card__version">v{plugin.version}</span>
        <span className="plugin-card__rating">{plugin.rating}</span>
        <span className="plugin-card__category">{plugin.category}</span>
      </div>
    </div>
    <div className="plugin-card__actions">
      {plugin.installed ? (
        <button type="button" className="plugin-card__btn plugin-card__btn--remove" onClick={onRemove}>
          Remove
        </button>
      ) : (
        <button type="button" className="plugin-card__btn plugin-card__btn--install" onClick={onInstall}>
          Install
        </button>
      )}
    </div>
  </div>
);
