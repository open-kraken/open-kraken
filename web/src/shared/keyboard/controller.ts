/**
 * Phase 9: Global keyboard shortcut system.
 * Migrated from golutra's keyboard/controller.ts.
 */

export type KeyCombo = {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type KeybindEntry = {
  id: string;
  combo: KeyCombo;
  scope?: string; // e.g. 'global', 'chat', 'terminal'
  description: string;
  handler: (event: KeyboardEvent) => void;
  /** If true, the keybind fires even when an input/textarea is focused. */
  activeInInput?: boolean;
};

const registry: KeybindEntry[] = [];

/** Register a keybind. Returns an unregister function. */
export const registerKeybind = (entry: KeybindEntry): (() => void) => {
  registry.push(entry);
  return () => {
    const idx = registry.indexOf(entry);
    if (idx >= 0) registry.splice(idx, 1);
  };
};

/** Parse a combo string like "Cmd+K" or "Ctrl+Shift+E". */
export const parseComboString = (input: string): KeyCombo => {
  const parts = input.split('+').map((p) => p.trim().toLowerCase());
  const combo: KeyCombo = { key: '' };
  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        combo.ctrl = true;
        break;
      case 'cmd':
      case 'meta':
      case 'command':
        combo.meta = true;
        break;
      case 'shift':
        combo.shift = true;
        break;
      case 'alt':
      case 'option':
        combo.alt = true;
        break;
      default:
        combo.key = part;
    }
  }
  return combo;
};

/** Check if a keyboard event matches a combo. */
export const isComboMatch = (event: KeyboardEvent, combo: KeyCombo): boolean => {
  const key = event.key.toLowerCase();
  if (key !== combo.key.toLowerCase()) return false;
  if (combo.ctrl && !event.ctrlKey) return false;
  if (combo.meta && !event.metaKey) return false;
  if (combo.shift && !event.shiftKey) return false;
  if (combo.alt && !event.altKey) return false;
  return true;
};

/** Check if the event target is an editable element. */
const isEditableTarget = (event: KeyboardEvent): boolean => {
  const target = event.target as HTMLElement;
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
};

/** Main keydown handler — attach to document. */
export const handleKeydownEvent = (event: KeyboardEvent): void => {
  // Skip during IME composition.
  if (event.isComposing) return;

  const inEditable = isEditableTarget(event);

  for (const entry of registry) {
    if (inEditable && !entry.activeInInput) continue;
    if (isComboMatch(event, entry.combo)) {
      event.preventDefault();
      event.stopPropagation();
      entry.handler(event);
      return;
    }
  }
};

/** Install the global keydown listener. Returns cleanup function. */
export const installKeyboardListener = (): (() => void) => {
  document.addEventListener('keydown', handleKeydownEvent);
  return () => document.removeEventListener('keydown', handleKeydownEvent);
};

/** Get all registered keybinds (for settings display). */
export const listKeybinds = (): ReadonlyArray<Omit<KeybindEntry, 'handler'>> =>
  registry.map(({ handler, ...rest }) => rest);
