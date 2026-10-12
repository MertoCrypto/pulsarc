/**
 * Pure state-machine helper for RouteErrorBoundary.
 * Kept framework-free so it can be tested with plain node:assert.
 */

export interface BoundaryState {
  failed: boolean;
  resetKey: string;
}

export type BoundaryEvent =
  | { type: "error" }
  | { type: "reset-key"; key: string }
  | { type: "retry" };

/**
 * Returns the next BoundaryState given the current state and an event.
 * Never mutates the input object.
 */
export function nextBoundaryState(
  prev: BoundaryState,
  event: BoundaryEvent,
): BoundaryState {
  switch (event.type) {
    case "error":
      // Mark failed; keep the current resetKey so a key-change can still recover.
      if (prev.failed) return prev; // idempotent
      return { failed: true, resetKey: prev.resetKey };

    case "reset-key":
      if (event.key === prev.resetKey) {
        // Same key — no change.
        return prev;
      }
      // Different key — clear the failure and record the new key.
      return { failed: false, resetKey: event.key };

    case "retry":
      if (!prev.failed) return prev; // idempotent
      return { failed: false, resetKey: prev.resetKey };
  }
}
