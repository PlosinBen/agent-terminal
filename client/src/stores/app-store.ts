import { create } from 'zustand';

export type Scope = 'app' | 'folder-picker' | 'folder-picker-form';

interface AppState {
  /** Stack of active keyboard scopes. Top = current foreground. */
  scopeStack: Scope[];

  /** Push a scope onto the stack (e.g. opening a modal). */
  pushScope: (scope: Scope) => void;

  /** Remove a specific scope from the stack (safe against cleanup order mismatches). */
  removeScope: (scope: Scope) => void;

  /** Current active scope (top of stack). */
  readonly currentScope: Scope;
}

export const useAppStore = create<AppState>()((set, get) => ({
  scopeStack: ['app'],

  pushScope: (scope) => set((s) => ({ scopeStack: [...s.scopeStack, scope] })),

  removeScope: (scope) => set((s) => {
    // Remove the last occurrence of the given scope
    const idx = s.scopeStack.lastIndexOf(scope);
    if (idx <= 0) return s; // never remove 'app' at index 0
    const next = [...s.scopeStack];
    next.splice(idx, 1);
    return { scopeStack: next.length > 0 ? next : ['app'] };
  }),

  get currentScope(): Scope {
    const stack = get().scopeStack;
    return stack[stack.length - 1];
  },
}));
