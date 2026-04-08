/**
 * Phase 9: React hook for keyboard shortcuts.
 */

import { useEffect } from 'react';
import type { KeyCombo } from './controller';
import { registerKeybind } from './controller';

type UseKeybindOptions = {
  combo: KeyCombo;
  handler: (event: KeyboardEvent) => void;
  scope?: string;
  description?: string;
  activeInInput?: boolean;
  enabled?: boolean;
};

/** Register a keyboard shortcut for the lifetime of the component. */
export const useKeybind = ({
  combo,
  handler,
  scope = 'global',
  description = '',
  activeInInput = false,
  enabled = true,
}: UseKeybindOptions) => {
  useEffect(() => {
    if (!enabled) return;
    const unregister = registerKeybind({
      id: `${scope}:${combo.key}`,
      combo,
      scope,
      description,
      handler,
      activeInInput,
    });
    return unregister;
  }, [combo.key, combo.ctrl, combo.meta, combo.shift, combo.alt, handler, scope, enabled, description, activeInInput]);
};
