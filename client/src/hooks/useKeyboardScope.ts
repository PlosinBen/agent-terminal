import { useEffect, useRef } from 'react';
import { useAppStore, type Scope } from '../stores/app-store';
import { keyboard, type KeyHandler } from '../services/keyboard';

/**
 * Register keybindings for a scope. Automatically pushes/pops the scope
 * on mount/unmount and cleans up registrations.
 *
 * @param scope    The keyboard scope to activate
 * @param bindings Map of binding string → handler (rebuilt when deps change)
 * @param options  autoScope: if true (default), push/pop scope on mount/unmount
 */
export function useKeyboardScope(
  scope: Scope,
  bindings: Record<string, KeyHandler>,
  options: { autoScope?: boolean } = {},
): void {
  const { autoScope = true } = options;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Push/pop scope
  useEffect(() => {
    if (!autoScope) return;
    useAppStore.getState().pushScope(scope);
    return () => useAppStore.getState().popScope();
  }, [scope, autoScope]);

  // Register all bindings — re-register when bindings object identity changes
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    for (const [binding, handler] of Object.entries(bindings)) {
      unsubs.push(keyboard.register(scope, binding, handler));
    }
    return () => unsubs.forEach(fn => fn());
  }, [scope, bindings]);
}
