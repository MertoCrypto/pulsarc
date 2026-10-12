/**
 * Safe-storage drift test for the Pulsarc site.
 *
 * Every localStorage / sessionStorage access (getItem, setItem, removeItem,
 * key, length, clear) must sit lexically inside a `try { … }` block — NOT
 * inside a catch or finally — because browser storage can throw in private
 * windows or when site data is blocked.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/safeStorage.test.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Allow-list: entries here are expected violations that are acceptable TODAY.
// Each entry must match at least one real violation or the test reports it as
// stale.  Format: { file: string (suffix OK), line_contains: string }.
// ---------------------------------------------------------------------------
const ALLOWED: Array<{ file: string; line_contains: string }> = [
  // Example (remove once the code is fixed):
  // { file: "src/hooks/useTheme.ts", line_contains: "localStorage.setItem('theme'" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect .ts and .tsx files under `dir`, excluding *.test.* */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (
      entry.isFile() &&
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.includes(".test.")
    ) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Strip single-line (//) and multi-line (/* … *\/) comments from `src`,
 * preserving line count by replacing each comment character with a space.
 * String literals are respected so `//` inside a string is not treated as a
 * comment start.
 */
function stripComments(src: string): string {
  const chars = src.split("");
  let i = 0;
  let inString: string | null = null; // '"' | "'" | "`"

  while (i < chars.length) {
    const c = chars[i];

    // Track string literals so we do not mangle them
    if (inString) {
      if (c === "\\" && inString !== "`") {
        i += 2; // skip escaped character
        continue;
      }
      if (c === inString) {
        inString = null;
      }
      i++;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      i++;
      continue;
    }

    // Multi-line comment
    if (c === "/" && chars[i + 1] === "*") {
      let j = i + 2;
      while (j < chars.length - 1) {
        if (chars[j] === "*" && chars[j + 1] === "/") {
          // Replace everything from i to j+1 (inclusive) with spaces,
          // but keep newlines to preserve line numbers.
          for (let k = i; k <= j + 1; k++) {
            if (chars[k] !== "\n") chars[k] = " ";
          }
          i = j + 2;
          break;
        }
        j++;
      }
      continue;
    }

    // Single-line comment
    if (c === "/" && chars[i + 1] === "/") {
      let j = i;
      while (j < chars.length && chars[j] !== "\n") {
        chars[j] = " ";
        j++;
      }
      i = j;
      continue;
    }

    i++;
  }

  return chars.join("");
}

// Storage API surface we care about
const STORAGE_METHODS = ["getItem", "setItem", "removeItem", "key", "length", "clear"];
const STORAGE_RE = new RegExp(
  `(?:localStorage|sessionStorage)\\.(?:${STORAGE_METHODS.join("|")})`,
  "g"
);

interface Violation {
  file: string;
  line: number;
  lineText: string;
}

/**
 * Return true if the character at position `pos` in `src` is lexically inside
 * a `try { … }` block (not inside a corresponding catch or finally).
 *
 * Strategy: walk BACKWARDS from pos, tracking net brace depth.  Every time we
 * close a brace-group (depth goes from 0 → -1 while scanning backwards), we
 * look at the keyword that introduced it.
 *
 *  - `try`      → we are inside a try-body → protected.
 *  - `catch`    → we are inside a catch-body → NOT protected; keep looking.
 *  - `finally`  → we are inside a finally-body → NOT protected; keep looking.
 *  - anything else (function, if, for, …) → transparent; keep looking.
 *
 * We stop at depth <= -100 (exceeded nesting budget) or when we run out of
 * characters, and return false (unprotected) in that case.
 */
function isInsideTryBlock(src: string, pos: number): boolean {
  let depth = 0; // positive = we have opened extra braces since pos
  let i = pos - 1;

  while (i >= 0) {
    const c = src[i];

    if (c === "}") {
      depth++;
      i--;
      continue;
    }

    if (c === "{") {
      if (depth > 0) {
        depth--;
        i--;
        continue;
      }

      // depth === 0: this `{` opens a block that directly contains our position
      // (or encloses a block that contains it).
      // Find the keyword (or expression) that precedes this `{`.
      const keyword = precedingKeyword(src, i);

      if (keyword === "try") return true;
      if (keyword === "catch" || keyword === "finally") {
        // We are in catch/finally — not protected by this block.
        // Keep walking backwards, but we must also skip the entire
        // corresponding `try { … }` and its catch/finally clauses that precede
        // this catch/finally, because we do NOT want to count ourselves as
        // being inside the try that owns this catch.  The simplest approach:
        // continue walking backwards as normal — we will skip the try's `{…}`
        // via depth counting and eventually see the `try` keyword as the
        // introducer of that block, but since we arrive there from depth=-1
        // direction we will NOT return true for it.  Actually we need to be
        // careful: the `try` block preceding this `catch` will be scanned as a
        // peer block at depth > 0 on the backwards walk, so it will just bump
        // depth up and we skip it correctly.  Continue normally.
        i--;
        continue;
      }

      // Any other keyword or expression (function body, if body, arrow body…):
      // transparent — keep going.
      i--;
      continue;
    }

    i--;
  }

  return false;
}

/**
 * Given the index of a `{` in `src`, return the alphanumeric keyword/token
 * that immediately precedes it (skipping whitespace and `)…(` groups like
 * `catch (e)` or `try`).
 */
function precedingKeyword(src: string, braceIdx: number): string {
  let i = braceIdx - 1;

  // Skip whitespace
  while (i >= 0 && /\s/.test(src[i])) i--;

  // Skip a closing `)` and its matching `(` (for `catch(e)`, `if(x)`, etc.)
  if (i >= 0 && src[i] === ")") {
    let depth = 1;
    i--;
    while (i >= 0 && depth > 0) {
      if (src[i] === ")") depth++;
      else if (src[i] === "(") depth--;
      i--;
    }
    // Skip whitespace again
    while (i >= 0 && /\s/.test(src[i])) i--;
  }

  // Read backwards identifier
  let end = i;
  while (i >= 0 && /[\w$]/.test(src[i])) i--;

  return src.slice(i + 1, end + 1);
}

// ---------------------------------------------------------------------------
// Self-checks on sample strings (run before scanning real files)
// ---------------------------------------------------------------------------

function runSelfChecks(): void {
  // Helper: does the STORAGE_RE match in `code` at a position that is inside
  // a try block according to our analyser?
  function check(code: string): { protected: boolean; found: boolean } {
    const stripped = stripComments(code);
    let match: RegExpExecArray | null;
    STORAGE_RE.lastIndex = 0;
    let found = false;
    let prot = false;
    while ((match = STORAGE_RE.exec(stripped)) !== null) {
      found = true;
      if (isInsideTryBlock(stripped, match.index)) prot = true;
    }
    return { protected: prot, found };
  }

  // 1. Access inside try → accepted (protected)
  {
    const code = `try { localStorage.getItem('a') } catch {}`;
    const r = check(code);
    assert.ok(r.found, "self-check 1: should find the access");
    assert.ok(r.protected, "self-check 1: try{localStorage.getItem} should be protected");
  }

  // 2. Bare access → flagged (unprotected)
  {
    const code = `localStorage.setItem('a','b')`;
    const r = check(code);
    assert.ok(r.found, "self-check 2: should find the access");
    assert.ok(!r.protected, "self-check 2: bare localStorage.setItem should be unprotected");
  }

  // 3. Access inside catch → flagged
  {
    const code = `try { x() } catch { localStorage.removeItem('a') }`;
    const r = check(code);
    assert.ok(r.found, "self-check 3: should find the access");
    assert.ok(!r.protected, "self-check 3: access inside catch should be unprotected");
  }

  // 4. Nested: try inside a function body
  {
    const code = `function foo() { try { sessionStorage.setItem('k','v') } catch(e) {} }`;
    const r = check(code);
    assert.ok(r.found, "self-check 4: should find the access");
    assert.ok(r.protected, "self-check 4: access inside try inside function should be protected");
  }

  // 5. Access inside finally → flagged
  {
    const code = `try { x() } catch {} finally { localStorage.clear() }`;
    const r = check(code);
    assert.ok(r.found, "self-check 5: should find the access");
    assert.ok(!r.protected, "self-check 5: access inside finally should be unprotected");
  }

  console.log("  ✓ All 5 self-checks passed.");
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

function scan(): { violations: Violation[]; totalAccesses: number; fileCount: number } {
  // Determine repo root: this file lives at src/lib/safeStorage.test.ts
  // so root is two levels up from __dirname (or from the resolved path).
  const scriptPath = new URL(import.meta.url).pathname;
  const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
  const srcDir = path.join(repoRoot, "src");

  const files = collectSourceFiles(srcDir);

  const violations: Violation[] = [];
  let totalAccesses = 0;
  const filesWithAccesses = new Set<string>();

  for (const absFile of files) {
    const raw = fs.readFileSync(absFile, "utf-8");
    const stripped = stripComments(raw);
    const lines = stripped.split("\n");
    // Build cumulative offsets so we can map char position → line number (1-based)
    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of lines) {
      lineStarts.push(offset);
      offset += line.length + 1; // +1 for the \n
    }

    function charPosToLine(pos: number): number {
      // Binary search
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= pos) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1; // 1-based
    }

    let match: RegExpExecArray | null;
    STORAGE_RE.lastIndex = 0;
    while ((match = STORAGE_RE.exec(stripped)) !== null) {
      totalAccesses++;
      filesWithAccesses.add(absFile);

      if (!isInsideTryBlock(stripped, match.index)) {
        const lineNum = charPosToLine(match.index);
        const rawLine = raw.split("\n")[lineNum - 1] ?? "";
        const trimmed = rawLine.trim().slice(0, 120);
        violations.push({
          file: path.relative(repoRoot, absFile),
          line: lineNum,
          lineText: trimmed,
        });
      }
    }
  }

  return { violations, totalAccesses, fileCount: filesWithAccesses.size };
}

// ---------------------------------------------------------------------------
// Allow-list filtering
// ---------------------------------------------------------------------------

function applyAllowList(
  violations: Violation[]
): { filtered: Violation[]; staleEntries: typeof ALLOWED } {
  const matchedEntries = new Set<number>();

  const filtered = violations.filter((v) => {
    const idx = ALLOWED.findIndex(
      (a) =>
        v.file.endsWith(a.file) ||
        v.file.includes(a.file) &&
        v.lineText.includes(a.line_contains)
    );
    if (idx !== -1) {
      // More precise: check both conditions
      const entry = ALLOWED[idx];
      if (
        (v.file.endsWith(entry.file) || v.file.includes(entry.file)) &&
        v.lineText.includes(entry.line_contains)
      ) {
        matchedEntries.add(idx);
        return false; // suppress this violation
      }
    }
    return true;
  });

  const staleEntries = ALLOWED.filter((_, i) => !matchedEntries.has(i));
  return { filtered, staleEntries };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

console.log("\n=== safeStorage drift test ===\n");

console.log("Running self-checks…");
runSelfChecks();

console.log("Scanning source files…");
const { violations: rawViolations, totalAccesses, fileCount } = scan();

console.log(
  `  Found ${totalAccesses} storage accesses across ${fileCount} file(s).\n`
);

// Minimum coverage assertion — fail fast if the scanner found nothing useful
assert.ok(
  totalAccesses >= 10,
  `Expected at least 10 storage accesses across the codebase but found ${totalAccesses}. ` +
    `Check that the src/ directory contains the full Pulsarc source tree.`
);

const { filtered: violations, staleEntries } = applyAllowList(rawViolations);

// Report stale allow-list entries
if (staleEntries.length > 0) {
  console.error("STALE allow-list entries (matched nothing — remove them):");
  for (const e of staleEntries) {
    console.error(`  file=${e.file}  line_contains=${e.line_contains}`);
  }
  assert.fail(
    `${staleEntries.length} stale allow-list entry/entries found. Remove entries that match no violations.`
  );
}

// Format violation report for the assertion message
function formatViolations(vs: Violation[]): string {
  if (vs.length === 0) return "";
  const lines = vs.map(
    (v) => `  ${v.file}:${v.line}  →  ${v.lineText}`
  );
  return (
    `\n\n${vs.length} unprotected storage access(es) found:\n` +
    lines.join("\n") +
    `\n\nFix: wrap each access in try { … } catch { … }.` +
    `\n(Or add an allow-list entry in ALLOWED if the access is intentionally unprotected.)\n`
  );
}

if (violations.length > 0) {
  console.log("Unprotected storage accesses:");
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}  →  ${v.lineText}`);
  }
  console.log();
}

assert.deepEqual(violations, [], formatViolations(violations));

console.log("✓ All storage accesses are properly guarded.\n");
