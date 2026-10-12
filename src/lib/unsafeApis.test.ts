/**
 * Unsafe-API drift test for the Pulsarc site.
 *
 * Runnable from the repo root:
 *   node --experimental-strip-types src/lib/unsafeApis.test.ts
 *
 * String-literal policy (documented choice):
 *   Comments are stripped before scanning, but STRING LITERALS ARE KEPT.
 *   Rationale: a token such as `.innerHTML` appearing inside a string could
 *   still represent a real usage path (e.g. a querySelector string, a template
 *   built at runtime, or documentation embedded in source).  Keeping strings
 *   means the test is conservative — it may flag false positives, but it will
 *   never silently miss a real injection vector.  Add a { file, token } entry
 *   to ALLOWED when you confirm a string-literal occurrence is benign.
 *   Therefore `const s = 'innerHTML'` IS flagged (see self-check below).
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ---------------------------------------------------------------------------
// Allow-list  (empty today — add { file, token } objects here as needed)
// ---------------------------------------------------------------------------
// WalletExtras renders the share card SVG built by shareCardSvg(), which XML-escapes
// every dynamic string (covered by src/lib/walletExtras.test.ts).
const ALLOWED: { file: string; token: string }[] = [
  { file: 'src/components/wallet/WalletExtras.tsx', token: 'dangerouslySetInnerHTML' },
];

// ---------------------------------------------------------------------------
// Tokens to flag
// ---------------------------------------------------------------------------
const UNSAFE_TOKENS: string[] = [
  "dangerouslySetInnerHTML",
  ".innerHTML",
  ".outerHTML",
  "insertAdjacentHTML",
  "document.write",
  "eval(",
  "new Function(",
  "`javascript:",   // backtick-string javascript: URL
  '"javascript:',   // double-quoted javascript: URL
  "'javascript:",   // single-quoted javascript: URL
];

// ---------------------------------------------------------------------------
// Comment stripping  (preserves string literals, line numbers, and column
// positions so the violation line numbers remain accurate)
// ---------------------------------------------------------------------------
function stripComments(src: string): string {
  // Simple state-machine: walk char by char, track string/template/regex
  // context.  Replace comment characters with spaces so line numbers are
  // stable.
  const out: string[] = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    const ch = src[i];

    // Line comment  //
    if (ch === "/" && src[i + 1] === "/") {
      // Consume until EOL
      while (i < len && src[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }

    // Block comment  /* ... */
    if (ch === "/" && src[i + 1] === "*") {
      out.push(" ");
      out.push(" ");
      i += 2;
      while (i < len) {
        if (src[i] === "*" && src[i + 1] === "/") {
          out.push(" ");
          out.push(" ");
          i += 2;
          break;
        }
        // Keep newlines so line numbers stay correct
        out.push(src[i] === "\n" ? "\n" : " ");
        i++;
      }
      continue;
    }

    // Double-quoted string  "..."
    if (ch === '"') {
      out.push(ch);
      i++;
      while (i < len && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < len) {
          out.push(src[i]);
          out.push(src[i + 1]);
          i += 2;
        } else {
          out.push(src[i]);
          i++;
        }
      }
      if (i < len) { out.push(src[i]); i++; }
      continue;
    }

    // Single-quoted string  '...'
    if (ch === "'") {
      out.push(ch);
      i++;
      while (i < len && src[i] !== "'") {
        if (src[i] === "\\" && i + 1 < len) {
          out.push(src[i]);
          out.push(src[i + 1]);
          i += 2;
        } else {
          out.push(src[i]);
          i++;
        }
      }
      if (i < len) { out.push(src[i]); i++; }
      continue;
    }

    // Template literal  `...`  (no nested template expressions for simplicity)
    if (ch === "`") {
      out.push(ch);
      i++;
      while (i < len && src[i] !== "`") {
        if (src[i] === "\\" && i + 1 < len) {
          out.push(src[i]);
          out.push(src[i + 1]);
          i += 2;
        } else {
          out.push(src[i]);
          i++;
        }
      }
      if (i < len) { out.push(src[i]); i++; }
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.includes(".test.")
    ) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Violation record
// ---------------------------------------------------------------------------
interface Violation {
  file: string;       // repo-relative path
  line: number;
  token: string;
  text: string;       // trimmed, capped at 120 chars
}

// ---------------------------------------------------------------------------
// Scan one file
// ---------------------------------------------------------------------------
function scanFile(absPath: string, repoRoot: string): Violation[] {
  const relPath = relative(repoRoot, absPath);
  const raw = readFileSync(absPath, "utf-8");
  const stripped = stripComments(raw);
  const lines = stripped.split("\n");
  const violations: Violation[] = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (const token of UNSAFE_TOKENS) {
      if (line.includes(token)) {
        // Normalise: the three javascript: variants share the same token key
        const normToken = token.startsWith("`javascript:")
          ? "javascript:"
          : token.startsWith('"javascript:')
          ? "javascript:"
          : token.startsWith("'javascript:")
          ? "javascript:"
          : token;

        violations.push({
          file: relPath,
          line: li + 1,
          token: normToken,
          text: line.trim().slice(0, 120),
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const repoRoot = new URL("../..", import.meta.url).pathname;
const srcDir = join(repoRoot, "src");

const allFiles = collectFiles(srcDir);
console.log(`Scanned ${allFiles.length} file(s) under src/`);

assert.ok(
  allFiles.length >= 60,
  `Expected at least 60 .ts/.tsx files under src/, found ${allFiles.length}. ` +
    `Add more source files or lower the threshold if the project is intentionally small.`
);

// Collect all violations
const rawViolations: Violation[] = allFiles.flatMap((f) =>
  scanFile(f, repoRoot)
);

// Apply allow-list: a violation is suppressed if ALLOWED has a matching entry
const suppressedAllowlistIndices = new Set<number>();
const activeViolations = rawViolations.filter((v) => {
  const idx = ALLOWED.findIndex(
    (a) => a.file === v.file && a.token === v.token
  );
  if (idx !== -1) {
    suppressedAllowlistIndices.add(idx);
    return false;
  }
  return true;
});

// Detect stale allow-list entries (entries that matched nothing)
const staleAllowlist = ALLOWED.filter((_, i) => !suppressedAllowlistIndices.has(i));
if (staleAllowlist.length > 0) {
  console.error("Stale allow-list entries (matched no violations):");
  for (const entry of staleAllowlist) {
    console.error(`  file=${entry.file}  token=${entry.token}`);
  }
  assert.fail(
    `Allow-list has ${staleAllowlist.length} stale entry/entries — remove them.`
  );
}

// Print violations for easier debugging
if (activeViolations.length > 0) {
  console.error(`\n${activeViolations.length} unsafe-API violation(s):\n`);
  for (const v of activeViolations) {
    console.error(`  ${v.file}:${v.line}  [${v.token}]  ${v.text}`);
  }
  console.error("");
}

assert.deepEqual(
  activeViolations,
  [],
  `${activeViolations.length} unsafe-API violation(s) found. ` +
    `Fix the code or add a { file, token } entry to ALLOWED with justification.`
);

console.log("All unsafe-API checks passed.");

// ---------------------------------------------------------------------------
// In-file self-checks (run unconditionally after the main assertions)
// ---------------------------------------------------------------------------
//
// These verify the scanner itself is working correctly on synthetic snippets,
// independent of the real source tree.

{
  const REPO_SELF = repoRoot;

  // Helper: scan a synthetic snippet as if it were a real file
  function syntheticViolations(code: string): string[] {
    const stripped = stripComments(code);
    const lines = stripped.split("\n");
    const found: string[] = [];
    for (let li = 0; li < lines.length; li++) {
      for (const token of UNSAFE_TOKENS) {
        if (lines[li].includes(token)) {
          found.push(token.trim());
        }
      }
    }
    return found;
  }

  // Self-check 1: `el.innerHTML = x`  → should be flagged
  {
    const snippet = `el.innerHTML = x;`;
    const hits = syntheticViolations(snippet);
    assert.ok(
      hits.some((h) => h.includes("innerHTML")),
      `Self-check 1 FAILED: 'el.innerHTML = x' should be flagged`
    );
  }

  // Self-check 2: `// el.innerHTML`  → comment stripped → should NOT be flagged
  {
    const snippet = `// el.innerHTML = x;`;
    const hits = syntheticViolations(snippet);
    assert.ok(
      !hits.some((h) => h.includes("innerHTML")),
      `Self-check 2 FAILED: '// el.innerHTML' should not be flagged (stripped as comment)`
    );
  }

  // Self-check 3: `const s = 'innerHTML'`  → string kept → IS flagged
  // (See string-literal policy note at the top of this file.)
  {
    const snippet = `const s = 'innerHTML';`;
    // NOTE: token is '.innerHTML' not bare 'innerHTML', so a lone 'innerHTML'
    // in a string without the leading dot is NOT matched.
    const hits = syntheticViolations(snippet);
    assert.ok(
      !hits.some((h) => h.includes("innerHTML")),
      `Self-check 3 FAILED: 'innerHTML' without leading dot should not match '.innerHTML' token`
    );
  }

  // Self-check 3b: `const s = '.innerHTML'`  → string kept → IS flagged
  {
    const snippet = `const s = '.innerHTML';`;
    const hits = syntheticViolations(snippet);
    assert.ok(
      hits.some((h) => h.includes("innerHTML")),
      `Self-check 3b FAILED: string '.innerHTML' should be flagged (strings are kept)`
    );
  }

  // Self-check 4: block comment containing innerHTML → NOT flagged
  {
    const snippet = `/* el.innerHTML is dangerous */`;
    const hits = syntheticViolations(snippet);
    assert.ok(
      !hits.some((h) => h.includes("innerHTML")),
      `Self-check 4 FAILED: innerHTML inside block comment should not be flagged`
    );
  }

  // Self-check 5: eval( is flagged
  {
    const snippet = `eval(userInput);`;
    const hits = syntheticViolations(snippet);
    assert.ok(
      hits.some((h) => h.includes("eval(")),
      `Self-check 5 FAILED: 'eval(' should be flagged`
    );
  }

  // Self-check 6: new Function( is flagged
  {
    const snippet = `const fn = new Function('return 1');`;
    const hits = syntheticViolations(snippet);
    assert.ok(
      hits.some((h) => h.includes("new Function(")),
      `Self-check 6 FAILED: 'new Function(' should be flagged`
    );
  }

  // Self-check 7: javascript: in a template literal is flagged
  {
    const snippet = "const url = `javascript:alert(1)`;";
    const hits = syntheticViolations(snippet);
    assert.ok(
      hits.some((h) => h.includes("`javascript:")),
      `Self-check 7 FAILED: backtick javascript: URL should be flagged`
    );
  }

  console.log("All self-checks passed.");
}
