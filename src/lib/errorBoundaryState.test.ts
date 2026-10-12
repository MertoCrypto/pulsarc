/**
 * Tests for nextBoundaryState.
 * Run with:  node --experimental-strip-types src/lib/errorBoundaryState.test.ts
 */
import assert from "node:assert/strict";
import { nextBoundaryState, type BoundaryState } from "./errorBoundaryState.ts";

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //

function fresh(failed = false, resetKey = "page-a"): BoundaryState {
  return { failed, resetKey };
}

// ------------------------------------------------------------------ //
// 'error' event
// ------------------------------------------------------------------ //

{
  const before = fresh();
  const after = nextBoundaryState(before, { type: "error" });

  assert.equal(after.failed, true, "'error' should set failed");
  assert.equal(after.resetKey, before.resetKey, "'error' should keep resetKey");
}

{
  // Firing 'error' twice is idempotent — must return the same reference
  const before = fresh(true, "page-a");
  const after = nextBoundaryState(before, { type: "error" });

  assert.strictEqual(after, before, "'error' on already-failed state must be a no-op (same reference)");
}

// ------------------------------------------------------------------ //
// 'reset-key' event — same key
// ------------------------------------------------------------------ //

{
  const before = fresh(true, "page-a");
  const after = nextBoundaryState(before, { type: "reset-key", key: "page-a" });

  assert.strictEqual(after, before, "same reset-key should return the same object (no-op)");
  assert.equal(after.failed, true, "same reset-key must not clear failed");
}

// ------------------------------------------------------------------ //
// 'reset-key' event — different key
// ------------------------------------------------------------------ //

{
  const before = fresh(true, "page-a");
  const after = nextBoundaryState(before, { type: "reset-key", key: "page-b" });

  assert.equal(after.failed, false, "different reset-key should clear failed");
  assert.equal(after.resetKey, "page-b", "different reset-key should update resetKey");
}

{
  // Non-failed + different key: clears nothing but still updates key
  const before = fresh(false, "page-a");
  const after = nextBoundaryState(before, { type: "reset-key", key: "page-b" });

  assert.equal(after.failed, false, "non-failed + different key: still not failed");
  assert.equal(after.resetKey, "page-b", "non-failed + different key: key updated");
}

// ------------------------------------------------------------------ //
// 'retry' event
// ------------------------------------------------------------------ //

{
  const before = fresh(true, "page-a");
  const after = nextBoundaryState(before, { type: "retry" });

  assert.equal(after.failed, false, "'retry' should clear failed");
  assert.equal(after.resetKey, "page-a", "'retry' should keep resetKey");
}

{
  // retry on a non-failed state is a no-op
  const before = fresh(false, "page-a");
  const after = nextBoundaryState(before, { type: "retry" });

  assert.strictEqual(after, before, "'retry' on non-failed state must be a no-op (same reference)");
}

// ------------------------------------------------------------------ //
// Mutation guard
// ------------------------------------------------------------------ //

{
  const before = fresh(false, "page-a");
  const frozenBefore = Object.freeze({ ...before });

  nextBoundaryState(before, { type: "error" });

  // Original object unchanged
  assert.equal(before.failed, frozenBefore.failed, "input must not be mutated by 'error'");
  assert.equal(before.resetKey, frozenBefore.resetKey, "input.resetKey must not be mutated by 'error'");
}

{
  const before = fresh(true, "page-a");
  const frozenBefore = Object.freeze({ ...before });

  nextBoundaryState(before, { type: "reset-key", key: "page-b" });

  assert.equal(before.failed, frozenBefore.failed, "input must not be mutated by 'reset-key'");
  assert.equal(before.resetKey, frozenBefore.resetKey, "input.resetKey must not be mutated by 'reset-key'");
}

{
  const before = fresh(true, "page-a");
  const frozenBefore = Object.freeze({ ...before });

  nextBoundaryState(before, { type: "retry" });

  assert.equal(before.failed, frozenBefore.failed, "input must not be mutated by 'retry'");
  assert.equal(before.resetKey, frozenBefore.resetKey, "input.resetKey must not be mutated by 'retry'");
}

// ------------------------------------------------------------------ //
// Compound: error then same key stays failed
// ------------------------------------------------------------------ //

{
  const s0 = fresh(false, "page-a");
  const s1 = nextBoundaryState(s0, { type: "error" });
  const s2 = nextBoundaryState(s1, { type: "reset-key", key: "page-a" });

  assert.equal(s2.failed, true, "error then same reset-key: still failed");
}

// ------------------------------------------------------------------ //
// Compound: error then different key recovers
// ------------------------------------------------------------------ //

{
  const s0 = fresh(false, "page-a");
  const s1 = nextBoundaryState(s0, { type: "error" });
  const s2 = nextBoundaryState(s1, { type: "reset-key", key: "page-b" });

  assert.equal(s2.failed, false, "error then different reset-key: recovered");
  assert.equal(s2.resetKey, "page-b", "error then different reset-key: key updated");
}

console.log("All errorBoundaryState tests passed.");
