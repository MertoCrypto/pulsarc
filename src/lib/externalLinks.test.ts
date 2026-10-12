/**
 * Drift-protection test: every JSX opening tag with target="_blank" must carry
 * a rel attribute containing "noreferrer".
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/externalLinks.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// ---------------------------------------------------------------------------
// Walk src/ and collect all .tsx files
// ---------------------------------------------------------------------------

function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(full));
    } else if (entry.isFile() && extname(entry.name) === ".tsx") {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Extract the full JSX opening tag that contains the character at `pos`.
//
// Strategy:
//   1. Walk backward from pos to find the < that starts the opening tag.
//      A JSX opening tag starts with `<` followed immediately by a letter
//      and is preceded by whitespace (newline or space), so we never mistake
//      a `<` inside an attribute value or a closing tag.
//   2. Walk forward from that `<`, counting brace depth to skip over
//      JSX expressions like onClick={() => fn()} or href={`${v}`}, and
//      stop at the first `>` at brace-depth 0.
//
// The approach is conservative: if we cannot find a valid start, we return
// null and the caller records that position as a violation.
// ---------------------------------------------------------------------------

function extractOpeningTag(content: string, pos: number): string | null {
  // Step 1: scan backward for the opening `<`
  let i = pos;
  while (i >= 0) {
    if (
      content[i] === "<" &&
      i + 1 < content.length &&
      /[A-Za-z]/.test(content[i + 1])
    ) {
      // Must be preceded by whitespace/newline (guards against hitting a `<`
      // inside an attribute string value or an expression).
      const charBefore = i > 0 ? content[i - 1] : "\n";
      if (/[\s\n]/.test(charBefore)) {
        break;
      }
    }
    i--;
  }
  if (i < 0) return null;

  // Step 2: scan forward, skip brace-balanced JSX expressions, stop at `>`
  const tagStart = i;
  let j = tagStart + 1; // skip past `<`
  let braceDepth = 0;
  while (j < content.length) {
    const ch = content[j];
    if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      braceDepth--;
    } else if (ch === ">" && braceDepth === 0) {
      // This `>` closes the opening tag's attribute list.
      return content.slice(tagStart, j + 1);
    }
    j++;
  }
  return null; // file ended before we found the closing `>`
}

// ---------------------------------------------------------------------------
// Check that rel="..." contains "noreferrer"
// ---------------------------------------------------------------------------

function hasNoreferrer(tag: string): boolean {
  return /\brel\s*=\s*["'][^"']*noreferrer[^"']*["']/.test(tag);
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

const srcRoot = join(process.cwd(), "src");
const files = collectTsxFiles(srcRoot);

type Violation = { location: string; tag: string };
const violations: Violation[] = [];
let totalFound = 0;

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const relFile = relative(process.cwd(), file);

  // Find every target="_blank" occurrence in the file
  const tbRegex = /target="_blank"/g;
  let match: RegExpExecArray | null;
  while ((match = tbRegex.exec(content)) !== null) {
    totalFound++;

    const tag = extractOpeningTag(content, match.index);

    if (tag === null) {
      // Could not extract the tag — treat as a violation so this never silently passes
      const lineNum = content.slice(0, match.index).split("\n").length;
      violations.push({
        location: `${relFile}:${lineNum}`,
        tag: "(could not extract opening tag)",
      });
      continue;
    }

    if (!hasNoreferrer(tag)) {
      const lineNum = content.slice(0, match.index).split("\n").length;
      const trimmed = tag.replace(/\s+/g, " ").trim().slice(0, 120);
      violations.push({
        location: `${relFile}:${lineNum}`,
        tag: trimmed,
      });
    }
  }
}

console.log(`Checked ${totalFound} target="_blank" tag(s) across ${files.length} .tsx file(s).`);

// Guard: if the regex matched fewer than 10 tags, it is likely broken or the
// source tree moved — fail loudly rather than give a false green.
assert.ok(
  totalFound >= 10,
  `Expected at least 10 target="_blank" tags (drift guard); found ${totalFound}. ` +
    `Check that the test is running from the repo root and that src/ is populated.`
);

// Main assertion: every external-link tag must carry rel="…noreferrer…"
assert.deepEqual(
  violations,
  [],
  `${violations.length} target="_blank" tag(s) are missing rel="noreferrer":\n` +
    violations.map((v) => `  ${v.location}\n    ${v.tag}`).join("\n")
);

console.log("All assertions passed.");
