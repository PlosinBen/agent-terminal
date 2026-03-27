import { create } from 'zustand';

export type Scope = 'app' | 'folder-picker' | 'folder-picker-form';

interface AppState {
  /** Stack of active keyboard scopes. Top = current foreground. */
  scopeStack: Scope[];

  /** Push a scope onto the stack (e.g. opening a modal). */
  pushScope: (scope: Scope) => void;

  /** Pop the top scope (e.g. closing a modal). Falls back to 'app'. */
  popScope: () => void;

  /** Current active scope (top of stack). */
  readonly currentScope: Scope;
}

export const useAppStore = create<AppState>()((set, get) => ({
  scopeStack: ['app'],

  pushScope: (scope) => set((s) => ({ scopeStack: [...s.scopeStack, scope] })),

  popScope: () => set((s) => ({
    scopeStack: s.scopeStack.length > 1 ? s.scopeStack.slice(0, -1) : ['app'],
  })),

  get currentScope(): Scope {
    const stack = get().scopeStack;
    return stack[stack.length - 1];
  },
}));
