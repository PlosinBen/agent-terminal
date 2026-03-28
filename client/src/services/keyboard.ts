/**
 * Scope-based keyboard service.
 *
 * Only the current foreground scope (from AppStore) receives key events.
 * Components register handlers via register() and the service dispatches
 * based on binding matches + active scope.
 */

import { useAppStore, type Scope } from '../stores/app-store';
import { matchesBinding } from '../keybindings';

/** Special pseudo-binding for catching single printable characters. */
export const PRINTABLE = '__printable__';

export type KeyHandler = (e: KeyboardEvent) => void;

interface Registration {
  scope: Scope;
  binding: string;  // e.g. 'ArrowUp', 'mod+o', or PRINTABLE
  handler: KeyHandler;
}

class KeyboardService {
  private registrations: Registration[] = [];
  private started = false;

  /** Start the global listener. Call once at app init. */
  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  stop(): void {
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.started = false;
  }

  /**
   * Register a keybinding for a scope.
   * Returns an unregister function.
   */
  register(scope: Scope, binding: string, handler: KeyHandler): () => void {
    const reg: Registration = { scope, binding, handler };
    this.registrations.push(reg);
    return () => {
      const idx = this.registrations.indexOf(reg);
      if (idx >= 0) this.registrations.splice(idx, 1);
    };
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const scope = useAppStore.getState().scopeStack;
    const currentScope = scope[scope.length - 1];

    // Collect all registrations for the current scope
    const scopeRegs = this.registrations.filter(r => r.scope === currentScope);

    // Try named bindings first
    for (const reg of scopeRegs) {
      if (reg.binding === PRINTABLE) continue;
      if (matchesBinding(e, reg.binding)) {
        e.preventDefault();
        reg.handler(e);
        return;
      }
    }

    // Then try printable catch-all
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      for (const reg of scopeRegs) {
        if (reg.binding === PRINTABLE) {
          e.preventDefault();
          reg.handler(e);
          return;
        }
      }
    }
  };
}

/** Singleton keyboard service instance. */
export const keyboard = new KeyboardService();
