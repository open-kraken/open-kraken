/**
 * Phase 7+9: Keybinds settings section — displays all registered shortcuts.
 */

import { listKeybinds } from '@/shared/keyboard/controller';

export const SettingsKeybindsSection = () => {
  const keybinds = listKeybinds();

  const formatCombo = (combo: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }) => {
    const parts: string[] = [];
    if (combo.ctrl) parts.push('Ctrl');
    if (combo.meta) parts.push('Cmd');
    if (combo.shift) parts.push('Shift');
    if (combo.alt) parts.push('Alt');
    parts.push(combo.key.toUpperCase());
    return parts.join(' + ');
  };

  return (
    <section className="route-page__panel">
      <header className="route-page__panel-header">
        <div>
          <p className="page-eyebrow">Keybinds</p>
          <h2>Keyboard Shortcuts</h2>
        </div>
      </header>

      {keybinds.length === 0 ? (
        <p>No keyboard shortcuts registered.</p>
      ) : (
        <ul className="route-page__rule-list">
          {keybinds.map((kb) => (
            <li key={kb.id}>
              <kbd className="settings-keybind__combo">{formatCombo(kb.combo)}</kbd>
              <span className="settings-keybind__desc">{kb.description}</span>
              {kb.scope && <span className="settings-keybind__scope">({kb.scope})</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
