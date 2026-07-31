"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * App-level React error boundary (Batch 23). Catches render-time exceptions in the
 * authenticated shells so a component crash shows a branded recovery screen instead of
 * a blank white page. Class component because error boundaries have no hook equivalent.
 */
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : "Unexpected error" };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    // Surfaced for debugging + any wired error reporter (e.g. Sentry) picks it up.
    console.error("ErrorBoundary caught a render error:", error, info);
  }

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This part of the app hit an unexpected error. Reloading usually fixes it.
            </p>
          </div>
          {this.state.message && (
            <p className="w-full break-words rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
              {this.state.message}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
