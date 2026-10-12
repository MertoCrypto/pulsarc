/**
 * Heading-structure drift test for the Pulsarc site.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/headings.test.ts
 *
 * Rules checked (ALL violations collected before one assert):
 *  1. Every page file has at least one h1.
 *  2. At most 2 h1 occurrences per file; files with exactly 2 print a NOTE (not a failure).
 *  3. No <h3 appears before the first <h2 in file order (only when the file has an <h3).
 *
 * A page "h1" is:
 *  - an opening <h1 tag  (e.g. <h1 className="x">), OR
 *  - a <SplitLines element whose attribute list contains  as="h1"
 *    (attributes may span lines and contain {...} expressions).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Self-checks: prove the h1 matcher before touching any real file
// ---------------------------------------------------------------------------

/**
 * Count h1 occurrences in a source string.
 *
 * Matches:
 *  a) <h1  (optionally followed by any non-> content then >)
 *  b) <SplitLines whose attribute block (possibly multi-line, containing {…})
 *     includes  as="h1"
 *
 * We use two separate regexes and count unique (non-overlapping) matches.
 */
function countH1(source: string): number {
  // (a) any <h1 opening tag
  const h1TagRe = /<h1[\s>\/]/g;

  // (b) <SplitLines ... as="h1" ... /> or <SplitLines ... as="h1" ... >
  //   The attribute block may span lines and contain balanced-ish {…} expressions.
  //   We match from <SplitLines up to the self-closing /> or bare >, capturing
  //   the interior, then check if it contains as="h1".
  //   Using [\s\S]*? (lazy) so we stop at the first /> or >.
  const splitLinesRe = /<SplitLines([\s\S]*?)(?:\/>|(?<!\/)>)/g;

  let count = 0;

  // Count (a)
  const h1Matches = source.matchAll(h1TagRe);
  for (const _ of h1Matches) count++;

  // Count (b) — only when the tag itself does NOT already match (a)
  // (SplitLines is a component name, not an h1 tag, so no overlap possible)
  const splitMatches = source.matchAll(splitLinesRe);
  for (const m of splitMatches) {
    const attrs = m[1] ?? "";
    // as="h1" — allow any surrounding whitespace, no quotes inside the value
    if (/\bas\s*=\s*"h1"/.test(attrs)) {
      count++;
    }
  }

  return count;
}

// --- inline self-checks ---

// Plain <h1 tag
assert.equal(
  countH1('<h1 className="hero-title">Hello</h1>'),
  1,
  "self-check: plain <h1 tag should count as 1",
);

// Multi-line <SplitLines as="h1" />
assert.equal(
  countH1(`<SplitLines
  as="h1"
  lines={["Welcome", "to Pulsarc"]}
/>`),
  1,
  "self-check: multi-line <SplitLines as=\"h1\" ... /> should count as 1",
);

// Both together → 2
assert.equal(
  countH1(`<h1 className="x">Title</h1>
<SplitLines
  as="h1"
  lines={["Sub"]}
/>`),
  2,
  "self-check: <h1 tag + <SplitLines as=\"h1\" together should count as 2",
);

// <SplitLines as="h2" should NOT count
assert.equal(
  countH1('<SplitLines as="h2" lines={[]} />'),
  0,
  'self-check: <SplitLines as="h2" should count as 0',
);

// No h1 at all
assert.equal(countH1("<h2>Section</h2>"), 0, "self-check: no h1 at all → 0");

// ---------------------------------------------------------------------------
// Locate pages directory
// ---------------------------------------------------------------------------

const pagesDir = path.join(process.cwd(), "src", "pages");

if (!fs.existsSync(pagesDir)) {
  throw new Error(
    `Pages directory not found at ${pagesDir}. ` +
      "Run this test from the repo root.",
  );
}

// Read ONLY direct children (non-recursive), .tsx files only
const pageFiles: string[] = fs
  .readdirSync(pagesDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".tsx"))
  .map((d) => path.join(pagesDir, d.name));

const checkedCount = pageFiles.length;
console.log(`\nChecked ${checkedCount} page file(s) in src/pages/\n`);

assert.ok(
  checkedCount >= 15,
  `Expected at least 15 page files, found ${checkedCount}. ` +
    "Run from the correct repo root.",
);

// ---------------------------------------------------------------------------
// Violation collection
// ---------------------------------------------------------------------------

type Violation = string;
const violations: Violation[] = [];

for (const filePath of pageFiles) {
  const name = path.relative(process.cwd(), filePath);
  const source = fs.readFileSync(filePath, "utf8");

  // --- Rule 1 & 2: h1 count --------------------------------------------------
  const h1Count = countH1(source);

  if (h1Count === 0) {
    violations.push(`[Rule 1] ${name}: no h1 found`);
  } else if (h1Count === 2) {
    // NOTE only — not a failure
    console.log(
      `NOTE: ${name} has 2 h1 occurrences (assumed separate return branches).`,
    );
  } else if (h1Count > 2) {
    violations.push(
      `[Rule 2] ${name}: ${h1Count} h1 occurrences (max 2 allowed)`,
    );
  }

  // --- Rule 3: no <h3 before first <h2 (only when file has an <h3) -----------
  const firstH3 = source.search(/<h3[\s>\/]/);
  if (firstH3 !== -1) {
    const firstH2 = source.search(/<h2[\s>\/]/);
    if (firstH2 === -1) {
      violations.push(
        `[Rule 3] ${name}: has <h3 but no <h2 (heading level skipped)`,
      );
    } else if (firstH3 < firstH2) {
      violations.push(
        `[Rule 3] ${name}: <h3 appears before first <h2 (heading level skipped)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Single assertion — all violations at once
// ---------------------------------------------------------------------------

assert.deepEqual(
  violations,
  [],
  `Heading structure violations found:\n${violations.map((v) => `  • ${v}`).join("\n")}`,
);

console.log(
  `\nAll ${checkedCount} page files pass heading-structure checks.\n`,
);
