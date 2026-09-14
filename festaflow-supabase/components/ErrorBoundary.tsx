"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

// Defense-in-depth only (see the request that led to this file): the real
// crash this project hit was the unauthenticated-request redirect bug fixed
// in lib/authz.ts - this boundary does not replace that fix, it exists so
// that ANY future uncaught render exception shows a controlled message
// instead of silently blanking the whole screen (which is what "the app
// closes" looked like with no boundary anywhere in the tree). Must be a
// class component - React has no functional equivalent for
// componentDidCatch/getDerivedStateFromError yet.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    // Technical detail stays in the console/server log only - never shown to
    // the user (see render() below).
    console.error("[AppErrorBoundary] uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 p-8 text-center">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-black text-slate-900">Algo deu errado nesta tela</h1>
            <p className="mt-3 text-sm text-slate-500">Recarregue e tente novamente.</p>
            <button onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
