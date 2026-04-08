/**
 * CommandPalette — Cmd+K global search panel.
 * Reference: Linear / Raycast command palette.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group?: string;
  shortcut?: string;
  handler: () => void;
};

type CommandPaletteProps = {
  items: CommandItem[];
  open: boolean;
  onClose: () => void;
};

export const CommandPalette = ({ items, open, onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.group?.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Group items.
  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const g = item.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return map;
  }, [filtered]);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll active item into view.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const execute = useCallback((item: CommandItem) => {
    item.handler();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[activeIndex]) execute(filtered[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filtered, activeIndex, execute, onClose]);

  if (!open) return null;

  let flatIndex = -1;

  const dialog = (
    <div className="command-palette-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="command-palette__input-wrap">
          <svg className="command-palette__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="command-palette__input"
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-palette__esc">ESC</kbd>
        </div>

        <div className="command-palette__results" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="command-palette__empty">No results for "{query}"</div>
          ) : (
            [...groups.entries()].map(([groupName, groupItems]) => (
              <div key={groupName} className="command-palette__group">
                {groupName && <div className="command-palette__group-label">{groupName}</div>}
                {groupItems.map((item) => {
                  flatIndex++;
                  const isActive = flatIndex === activeIndex;
                  const idx = flatIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`command-palette__item ${isActive ? 'command-palette__item--active' : ''}`}
                      data-active={isActive || undefined}
                      onClick={() => execute(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      {item.icon && <span className="command-palette__item-icon">{item.icon}</span>}
                      <div className="command-palette__item-text">
                        <span className="command-palette__item-label">{item.label}</span>
                        {item.description && (
                          <span className="command-palette__item-desc">{item.description}</span>
                        )}
                      </div>
                      {item.shortcut && (
                        <kbd className="command-palette__item-shortcut">{item.shortcut}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
};
