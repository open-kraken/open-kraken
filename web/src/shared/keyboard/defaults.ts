/**
 * Default keyboard shortcuts registered at app startup.
 */
import { registerKeybind } from './controller';

export const registerDefaultKeybinds = (actions: {
  navigateToChat: () => void;
  navigateToTerminal: () => void;
  navigateToSettings: () => void;
  toggleTheme: () => void;
}) => {
  const cleanups: Array<() => void> = [];

  // Cmd/Ctrl + K — focus search / command palette (future)
  cleanups.push(registerKeybind({
    id: 'global:cmd-k',
    combo: { key: 'k', meta: true },
    scope: 'global',
    description: 'Open command palette',
    handler: () => {
      // Placeholder: navigate to chat as proxy for search
      actions.navigateToChat();
    },
    activeInInput: false,
  }));

  // Cmd/Ctrl + 1 — Chat
  cleanups.push(registerKeybind({
    id: 'global:cmd-1',
    combo: { key: '1', meta: true },
    scope: 'global',
    description: 'Navigate to Chat',
    handler: () => actions.navigateToChat(),
    activeInInput: false,
  }));

  // Cmd/Ctrl + 2 — Terminal
  cleanups.push(registerKeybind({
    id: 'global:cmd-2',
    combo: { key: '2', meta: true },
    scope: 'global',
    description: 'Navigate to Terminal',
    handler: () => actions.navigateToTerminal(),
    activeInInput: false,
  }));

  // Cmd/Ctrl + , — Settings
  cleanups.push(registerKeybind({
    id: 'global:cmd-comma',
    combo: { key: ',', meta: true },
    scope: 'global',
    description: 'Open Settings',
    handler: () => actions.navigateToSettings(),
    activeInInput: false,
  }));

  // Cmd/Ctrl + Shift + L — Toggle theme
  cleanups.push(registerKeybind({
    id: 'global:toggle-theme',
    combo: { key: 'l', meta: true, shift: true },
    scope: 'global',
    description: 'Toggle light/dark theme',
    handler: () => actions.toggleTheme(),
    activeInInput: false,
  }));

  // Escape — close modals / context menus (handled by individual components, but registered for settings display)
  cleanups.push(registerKeybind({
    id: 'global:escape',
    combo: { key: 'escape' },
    scope: 'global',
    description: 'Close modal or menu',
    handler: () => {
      // Dispatch a custom event that modals listen to.
      document.dispatchEvent(new CustomEvent('kraken:escape'));
    },
    activeInInput: true,
  }));

  return () => cleanups.forEach((fn) => fn());
};
