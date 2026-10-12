import React, { type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  nextBoundaryState,
  type BoundaryState,
} from "@/lib/errorBoundaryState";

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  failed: boolean;
}

export class RouteErrorBoundary extends React.Component<Props, State> {
  private _internalKey: string;

  constructor(props: Props) {
    super(props);
    this.state = { failed: false };
    this._internalKey = props.resetKey;
  }

  // ------------------------------------------------------------------ //
  // Lifecycle
  // ------------------------------------------------------------------ //

  static getDerivedStateFromError(_error: unknown): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[RouteErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.resetKey !== this.props.resetKey) {
      const next: BoundaryState = nextBoundaryState(
        { failed: this.state.failed, resetKey: this._internalKey },
        { type: "reset-key", key: this.props.resetKey },
      );
      this._internalKey = next.resetKey;
      if (!next.failed && this.state.failed) {
        this.setState({ failed: false });
      }
    }
  }

  // ------------------------------------------------------------------ //
  // Handlers
  // ------------------------------------------------------------------ //

  private _handleRetry = (): void => {
    const next: BoundaryState = nextBoundaryState(
      { failed: this.state.failed, resetKey: this._internalKey },
      { type: "retry" },
    );
    this._internalKey = next.resetKey;
    this.setState({ failed: next.failed });
  }

  // ------------------------------------------------------------------ //
  // Render
  // ------------------------------------------------------------------ //

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-12">
        <div className="arc-card px-6 py-8 space-y-4 max-w-md w-full">
          <p className="arc-eyebrow">Something went wrong</p>
          <p className="text-sm text-white/[0.65] leading-relaxed">
            This page hit an error. The rest of the site still works.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="arc-btn"
              onClick={this._handleRetry}
            >
              Try again
            </button>
            <Link to="/" className="arc-btn-ghost">
              Back to rankings
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
