/**
 * Phase 9: Context menu system — Portal-based context menu rendering.
 * Migrated from golutra's contextMenu/ContextMenuHost.vue.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  handler?: () => void;
};

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
};

const initialState: ContextMenuState = { visible: false, x: 0, y: 0, items: [] };

// Singleton state for context menu (avoids prop drilling).
let menuState = initialState;
let menuListeners = new Set<(s: ContextMenuState) => void>();

const notifyMenu = () => menuListeners.forEach((fn) => fn(menuState));

/** Open a context menu at the given position. */
export const openContextMenu = (x: number, y: number, items: ContextMenuItem[]) => {
  menuState = { visible: true, x, y, items };
  notifyMenu();
};

/** Close the context menu. */
export const closeContextMenu = () => {
  menuState = initialState;
  notifyMenu();
};

/** Hook to show a context menu on right-click. */
export const useContextMenu = (items: ContextMenuItem[]) => {
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, items);
  };
  return { onContextMenu };
};

/** Portal component that renders the context menu. Mount once at app root. */
export const ContextMenuHost = () => {
  const [state, setState] = useState(initialState);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuListeners.add(setState);
    return () => { menuListeners.delete(setState); };
  }, []);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!state.visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [state.visible]);

  if (!state.visible) return null;

  // Clamp position to viewport.
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(state.x, window.innerWidth - 200),
    top: Math.min(state.y, window.innerHeight - state.items.length * 36),
    zIndex: 9999,
  };

  return (
    <div ref={menuRef} className="context-menu" style={style} role="menu">
      {state.items.map((item) =>
        item.separator ? (
          <div key={item.id} className="context-menu__separator" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`context-menu__item ${item.danger ? 'context-menu__item--danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              item.handler?.();
              closeContextMenu();
            }}
          >
            {item.icon && <span className="context-menu__icon">{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>
  );
};
