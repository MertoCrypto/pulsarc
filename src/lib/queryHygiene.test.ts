/**
 * React-Query hygiene drift test for the Pulsarc site.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/queryHygiene.test.ts
 *
 * Rules checked for every useQuery( call:
 *   R1  – argument must contain `queryKey:`
 *   R2  – argument must contain `staleTime`
 *   R3  – if the queryFn text references `${net}` or `${network}`, the
 *          queryKey array must also contain that same identifier, otherwise
 *          mainnet and testnet data would collide in the cache.
 *
 * Violations are collected, then asserted to be empty via assert.deepEqual.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Allow-list: { file, rule } pairs that are known-acceptable exceptions.
// A stale entry (one that matches nothing) is itself a test failure.
// ---------------------------------------------------------------------------
const ALLOWED: { file: string; rule: string }[] = [
  // Example (add real entries here when needed):
  // { file: "src/hooks/useFoo.ts", rule: "R2" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Violation {
  file: string;
  line: number;
  rule: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// File discovery – every .ts/.tsx under src/ except *.test.* files
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Comment stripping (preserves line numbers by replacing comment text with
// whitespace; does NOT collapse lines).
// ---------------------------------------------------------------------------
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;

  while (i < n) {
    // --- string literals ---
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      out += src[i++];
      while (i < n) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i] + src[i + 1];
          i += 2;
        } else if (src[i] === q) {
          out += src[i++];
          break;
        } else {
          out += src[i++];
        }
      }
    }
    // --- template literals ---
    else if (src[i] === "`") {
      out += src[i++];
      let depth = 0; // ${ nesting depth
      while (i < n) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i] + src[i + 1];
          i += 2;
        } else if (src[i] === "$" && src[i + 1] === "{") {
          out += src[i] + src[i + 1];
          i += 2;
          depth++;
        } else if (depth > 0 && src[i] === "}") {
          depth--;
          out += src[i++];
        } else if (depth === 0 && src[i] === "`") {
          out += src[i++];
          break;
        } else {
          out += src[i++];
        }
      }
    }
    // --- line comment ---
    else if (src[i] === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") {
        out += " ";
        i++;
      }
    }
    // --- block comment ---
    else if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n) {
        if (src[i] === "*" && src[i + 1] === "/") {
          out += "  ";
          i += 2;
          break;
        }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
    } else {
      out += src[i++];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extract balanced-parentheses argument text starting at the `(` that
// immediately follows `useQuery`.  Handles:
//   - nested ()  {}  []
//   - string literals  ' "
//   - template literals ` with ${...} nesting (including nested calls)
// Returns the text INSIDE the outer parens (not including them), or null if
// the source is malformed.
// ---------------------------------------------------------------------------
function extractArgText(src: string, openParen: number): string | null {
  let i = openParen + 1; // start just after `(`
  const n = src.length;
  let depth = 1; // we are already inside the opening `(`
  let result = "";

  while (i < n && depth > 0) {
    const ch = src[i];

    // --- string literals ---
    if (ch === '"' || ch === "'") {
      const q = ch;
      result += src[i++];
      while (i < n) {
        if (src[i] === "\\" && i + 1 < n) {
          result += src[i] + src[i + 1];
          i += 2;
        } else if (src[i] === q) {
          result += src[i++];
          break;
        } else {
          result += src[i++];
        }
      }
      continue;
    }

    // --- template literals (with ${...} nesting) ---
    if (ch === "`") {
      result += src[i++];
      // inner function to consume a template literal body, returning when
      // the closing ` is found at nesting level 0.
      const consumeTemplate = (): void => {
        while (i < n) {
          if (src[i] === "\\" && i + 1 < n) {
            result += src[i] + src[i + 1];
            i += 2;
          } else if (src[i] === "$" && src[i + 1] === "{") {
            result += src[i] + src[i + 1];
            i += 2;
            // consume the expression inside ${...}, respecting nesting
            let exprDepth = 1;
            while (i < n && exprDepth > 0) {
              const ec = src[i];
              if (ec === '"' || ec === "'") {
                const q = ec;
                result += src[i++];
                while (i < n) {
                  if (src[i] === "\\" && i + 1 < n) {
                    result += src[i] + src[i + 1];
                    i += 2;
                  } else if (src[i] === q) {
                    result += src[i++];
                    break;
                  } else {
                    result += src[i++];
                  }
                }
              } else if (ec === "`") {
                result += src[i++];
                consumeTemplate(); // recurse for nested template
              } else if (ec === "{" || ec === "(" || ec === "[") {
                exprDepth++;
                result += src[i++];
              } else if (ec === "}" || ec === ")" || ec === "]") {
                exprDepth--;
                if (exprDepth === 0) {
                  result += src[i++]; // closing `}`
                  break;
                }
                result += src[i++];
              } else {
                result += src[i++];
              }
            }
          } else if (src[i] === "`") {
            result += src[i++];
            break; // end of this template literal
          } else {
            result += src[i++];
          }
        }
      };
      consumeTemplate();
      continue;
    }

    // --- bracket / paren counting ---
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      result += src[i++];
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) break; // closing paren of useQuery(
      result += src[i++];
      continue;
    }

    result += src[i++];
  }

  return depth === 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Extract the balanced [...] text right after `queryKey:` within argText.
// Returns null if not found or if the value is not an inline array literal.
// ---------------------------------------------------------------------------
function extractQueryKeyArray(argText: string): string | null {
  const match = /queryKey\s*:\s*/.exec(argText);
  if (!match) return null;
  const start = match.index + match[0].length;
  if (argText[start] !== "[") return null; // not an inline array – skip R3

  let depth = 0;
  let i = start;
  let result = "";
  while (i < argText.length) {
    const ch = argText[i];
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    else if (ch === "]" || ch === ")" || ch === "}") {
      depth--;
      result += ch;
      i++;
      if (depth === 0) break;
      continue;
    }
    result += ch;
    i++;
  }
  return depth === 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Determine the 1-based line number for a character offset in `src`.
// ---------------------------------------------------------------------------
function lineAt(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Core: scan one file for useQuery( calls and collect violations.
// ---------------------------------------------------------------------------
function checkFile(
  filePath: string,
  relPath: string,
  violations: Violation[],
): { calls: number; skippedR3: number } {
  const raw = fs.readFileSync(filePath, "utf8");
  const src = stripComments(raw);

  const re = /\buseQuery\s*\(/g;
  let calls = 0;
  let skippedR3 = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    calls++;
    const openParen = m.index + m[0].length - 1; // index of `(`
    const callLine = lineAt(src, m.index);
    const argText = extractArgText(src, openParen);

    if (argText === null) {
      violations.push({
        file: relPath,
        line: callLine,
        rule: "PARSE",
        reason: "Could not extract balanced argument text",
      });
      continue;
    }

    // A call that spreads a shared options factory (`...options(app)`) takes its
    // queryKey/staleTime from that factory, so R1/R2 cannot be judged here.
    const spreadsFactory = /\.\.\.\s*[A-Za-z_$][\w$.]*\s*\(/.test(argText);

    // R1 – must have queryKey:
    if (!spreadsFactory && !/queryKey\s*:/.test(argText)) {
      violations.push({
        file: relPath,
        line: callLine,
        rule: "R1",
        reason: "useQuery call is missing queryKey:",
      });
    }

    // R2 – must have staleTime
    if (!spreadsFactory && !/\bstaleTime\b/.test(argText)) {
      violations.push({
        file: relPath,
        line: callLine,
        rule: "R2",
        reason: "useQuery call is missing staleTime (explicit freshness decision required)",
      });
    }

    // R3 – network-aware queryKey check
    const hasNetInterp = /\$\{net\b/.test(argText) || /\$\{network\b/.test(argText);
    if (hasNetInterp) {
      const qkArray = extractQueryKeyArray(argText);
      if (qkArray === null) {
        // queryKey is not an inline array literal – skip R3 for this call
        skippedR3++;
      } else {
        const netInArg = /\$\{net\b/.test(argText);
        const networkInArg = /\$\{network\b/.test(argText);
        const qkHasNet = /\bnet\b/.test(qkArray);
        const qkHasNetwork = /\bnetwork\b/.test(qkArray);

        if (netInArg && !qkHasNet) {
          violations.push({
            file: relPath,
            line: callLine,
            rule: "R3",
            reason:
              "`${net}` used in queryFn but `net` is absent from queryKey array – mainnet/testnet data would share one cache entry",
          });
        }
        if (networkInArg && !qkHasNetwork) {
          violations.push({
            file: relPath,
            line: callLine,
            rule: "R3",
            reason:
              "`${network}` used in queryFn but `network` is absent from queryKey array – mainnet/testnet data would share one cache entry",
          });
        }
      }
    }
  }

  return { calls, skippedR3 };
}

// ---------------------------------------------------------------------------
// In-file self-checks (fast, no filesystem)
// ---------------------------------------------------------------------------
function runSelfChecks(): void {
  console.log("── self-checks ─────────────────────────────────────────────");

  // Helper: run rules on a snippet and return violation rule codes
  const rulesFor = (snippet: string): string[] => {
    // We run the logic inline so we don't need a real file
    const argText = extractArgText(`useQuery(${snippet})`, "useQuery(".length - 1);
    if (argText === null) return ["PARSE"];
    const found: string[] = [];
    if (!/queryKey\s*:/.test(argText)) found.push("R1");
    if (!/\bstaleTime\b/.test(argText)) found.push("R2");
    const hasNetInterp = /\$\{net\b/.test(argText) || /\$\{network\b/.test(argText);
    if (hasNetInterp) {
      const qkArray = extractQueryKeyArray(argText);
      if (qkArray !== null) {
        if (/\$\{net\b/.test(argText) && !/\bnet\b/.test(qkArray)) found.push("R3:net");
        if (/\$\{network\b/.test(argText) && !/\bnetwork\b/.test(qkArray)) found.push("R3:network");
      }
    }
    return found;
  };

  // SC1 – missing staleTime is flagged
  {
    const snippet = `{ queryKey: ["foo"], queryFn: () => fetch("/api") }`;
    const rules = rulesFor(snippet);
    assert.ok(rules.includes("R2"), `SC1 failed: expected R2 in ${JSON.stringify(rules)}`);
    assert.ok(!rules.includes("R1"), `SC1 failed: unexpected R1`);
    console.log("  SC1 PASS – missing staleTime is flagged as R2");
  }

  // SC2 – ${net} in URL but absent from queryKey is flagged as R3
  {
    const snippet = "{ queryKey: [\"balances\"], queryFn: () => fetch(`/api/${net}/bal`), staleTime: 60_000 }";
    const rules = rulesFor(snippet);
    assert.ok(rules.includes("R3:net"), `SC2 failed: expected R3:net in ${JSON.stringify(rules)}`);
    console.log("  SC2 PASS – ${net} in queryFn without net in queryKey is flagged as R3");
  }

  // SC3 – correct call passes all rules
  {
    const snippet = "{ queryKey: [\"balances\", net], queryFn: () => fetch(`/api/${net}/bal`), staleTime: 60_000 }";
    const rules = rulesFor(snippet);
    assert.deepEqual(rules, [], `SC3 failed: unexpected violations ${JSON.stringify(rules)}`);
    console.log("  SC3 PASS – correct call passes all rules");
  }

  // SC4 – template literal with `)` inside does not break extractor
  {
    const snippet = "{ queryKey: [\"x\"], queryFn: () => fetch(`/a/${fn(b)}/c`), staleTime: 0 }";
    const argText = extractArgText(`useQuery(${snippet})`, "useQuery(".length - 1);
    assert.ok(argText !== null, "SC4 failed: extractor returned null for template with ) inside");
    assert.ok(argText.includes("queryKey"), "SC4 failed: argText does not include queryKey");
    console.log("  SC4 PASS – template literal with `)` inside does not break extractor");
  }

  // SC5 – template literal with ${a(b)} inside does not break extractor
  {
    const snippet = "{ queryKey: [\"x\", net], queryFn: () => fetch(`/api/${net}/${a(b)}`), staleTime: 0 }";
    const argText = extractArgText(`useQuery(${snippet})`, "useQuery(".length - 1);
    assert.ok(argText !== null, "SC5 failed: extractor returned null for ${a(b)} in template");
    assert.ok(argText.includes("staleTime"), "SC5 failed: argText does not include staleTime");
    console.log("  SC5 PASS – template literal with ${a(b)} inside does not break extractor");
  }

  console.log("── self-checks all passed ───────────────────────────────────\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  runSelfChecks();

  // Locate the src/ directory relative to this file's location so the test
  // works when invoked from any cwd, as long as it is inside the repo.
  const thisFile = new URL(import.meta.url).pathname;
  // This file lives at src/lib/queryHygiene.test.ts → src/ is two levels up
  const srcDir = path.resolve(path.dirname(thisFile), "..");

  if (!fs.existsSync(srcDir)) {
    throw new Error(`src/ directory not found at expected path: ${srcDir}`);
  }

  const files = collectSourceFiles(srcDir);
  console.log(`Scanning ${files.length} source files under ${srcDir} …\n`);

  const allViolations: Violation[] = [];
  let totalCalls = 0;
  let totalSkippedR3 = 0;

  for (const f of files) {
    const relPath = path.relative(path.dirname(srcDir), f); // e.g. src/hooks/useFoo.ts
    const { calls, skippedR3 } = checkFile(f, relPath, allViolations);
    totalCalls += calls;
    totalSkippedR3 += skippedR3;
  }

  // Apply allow-list
  const allowedUsed = new Set<number>();
  const effectiveViolations = allViolations.filter((v) => {
    const idx = ALLOWED.findIndex(
      (a) => v.file.endsWith(a.file) && v.rule === a.rule,
    );
    if (idx !== -1) {
      allowedUsed.add(idx);
      return false;
    }
    return true;
  });

  // Stale allow-list entries
  for (let i = 0; i < ALLOWED.length; i++) {
    if (!allowedUsed.has(i)) {
      effectiveViolations.push({
        file: ALLOWED[i].file,
        line: 0,
        rule: "STALE_ALLOWLIST",
        reason: `Allow-list entry { file: "${ALLOWED[i].file}", rule: "${ALLOWED[i].rule}" } matched nothing – remove it`,
      });
    }
  }

  console.log(`useQuery calls checked : ${totalCalls}`);
  console.log(`skipped rule-3 checks  : ${totalSkippedR3} (queryKey not an inline array)`);
  console.log(`violations found       : ${allViolations.length}`);
  console.log(`after allow-list       : ${effectiveViolations.length}`);
  if (effectiveViolations.length > 0) {
    console.log("\nViolations:\n");
    for (const v of effectiveViolations) {
      console.log(`  ${v.file}:${v.line}  [${v.rule}]  ${v.reason}`);
    }
    console.log();
  }

  // Minimum coverage guard
  assert.ok(
    totalCalls >= 20,
    `Expected at least 20 useQuery calls to be checked, found ${totalCalls}. ` +
      `Is this the right repository?`,
  );

  // Main assertion
  assert.deepEqual(
    effectiveViolations,
    [],
    `React-Query hygiene violations found (${effectiveViolations.length}). ` +
      `Fix the violations above or add them to the ALLOWED list with a comment.`,
  );

  console.log("\n✓ All React-Query hygiene checks passed.");
}

main();
