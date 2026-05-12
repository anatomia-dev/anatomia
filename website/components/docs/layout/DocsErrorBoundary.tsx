"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary for docs content area.
 * Catches broken MDX and shows a fallback instead of crashing the entire
 * docs section. Must be a class component (React requirement).
 */
export class DocsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Docs] Content rendering error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="mx-auto max-w-lg py-20 text-center"
          role="alert"
        >
          <h2
            className="mb-3 text-[18px] font-semibold"
            style={{ color: "var(--fg-strong)" }}
          >
            Something went wrong
          </h2>
          <p
            className="mb-6 text-[14px]"
            style={{ color: "var(--ink-60)" }}
          >
            This page encountered an error while rendering. Try refreshing,
            or go back to the docs home page.
          </p>
          <a
            href="/docs"
            className="inline-block rounded-[var(--radius-sm)] px-4 py-2 font-mono text-[13px] font-medium"
            style={{
              background: "var(--fg-strong)",
              color: "var(--color-brand-ink)",
            }}
          >
            Back to docs
          </a>
        </div>
      );
    }

    return this.props.children;
  }
}
