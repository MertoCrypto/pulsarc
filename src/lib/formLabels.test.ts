/**
 * Form-field labelling drift test for the Pulsarc site.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/formLabels.test.ts
 *
 * Rules checked for every <input>, <select>, <textarea> JSX opening tag:
 *   1. <input type="hidden"> → always skip (no label needed).
 *   2. <input type="checkbox"> / <input type="radio"> → skip ONLY when the tag
 *      already carries aria-label, aria-labelledby, or id; otherwise violation.
 *   3. Every remaining field must have aria-label, aria-labelledby, or id
 *      (assume id ↔ <label htmlFor>), OR be wrapped inside an unclosed
 *      <label> within the 400 chars that precede the tag in the file.
 *   4. A placeholder attribute alone does NOT count as a label.
 *
 * Violations are collected across all files before a single deepEqual failure.
 */

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect every .tsx file under `dir`. */
function collectTsx(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsx(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract JSX opening tags for <input>, <select>, and <textarea> from `src`.
 *
 * Uses brace-depth tracking so `{() => something}` inside an attribute does
 * not confuse the tag-end detector.  Tags may span multiple lines.
 *
 * Returns an array of { tagText, startIndex } objects.
 */
function extractFieldTags(src: string): Array<{ tagText: string; startIndex: number }> {
  const OPEN = /(<)(input|select|textarea)(?=[\s/>])/gi;
  const results: Array<{ tagText: string; startIndex: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = OPEN.exec(src)) !== null) {
    const start = match.index;
    let i = start + match[0].length; // position right after the tag name
    let braceDepth = 0;
    let tagEnd = -1;

    while (i < src.length) {
      const ch = src[i];

      if (ch === "{") {
        braceDepth++;
        i++;
        continue;
      }
      if (ch === "}") {
        braceDepth--;
        i++;
        continue;
      }

      if (braceDepth > 0) {
        i++;
        continue;
      }

      // Outside braces: look for tag-close sequences
      if (ch === "/" && src[i + 1] === ">") {
        tagEnd = i + 2;
        break;
      }
      if (ch === ">") {
        tagEnd = i + 1;
        break;
      }
      i++;
    }

    if (tagEnd === -1) {
      // Malformed / unterminated tag – skip
      continue;
    }

    results.push({ tagText: src.slice(start, tagEnd), startIndex: start });
  }

  return results;
}

/** Return true when the raw attribute string is found in the tag text. */
function hasAttr(tagText: string, attrName: string): boolean {
  // Matches: attrName="..." or attrName={'...'} or just attrName (boolean)
  const re = new RegExp(`\\b${attrName}\\b`, "i");
  return re.test(tagText);
}

/**
 * Extract the value of `type` from the tag text.
 * Handles: type="value"  type='value'  type={expr}
 * Returns lowercase string or "" when absent.
 */
function getTypeAttr(tagText: string): string {
  const m = tagText.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|\{["']([^"']*)["']\})/i);
  if (!m) return "";
  return (m[1] ?? m[2] ?? m[3] ?? "").toLowerCase();
}

/**
 * Return true when the 400 characters preceding `startIndex` in `src`
 * contain an unclosed <label element (i.e., a "<label" that is not yet closed
 * by a "</label>").
 */
function isInsideLabel(src: string, startIndex: number): boolean {
  const LOOKBACK = 400;
  const slice = src.slice(Math.max(0, startIndex - LOOKBACK), startIndex);

  // Find last occurrence of <label (opening) and </label> (closing)
  const lastOpen = slice.lastIndexOf("<label");
  const lastClose = slice.lastIndexOf("</label");

  return lastOpen !== -1 && lastOpen > lastClose;
}

// ---------------------------------------------------------------------------
// Self-checks (inline unit tests on synthetic strings)
// ---------------------------------------------------------------------------

function runSelfChecks(): void {
  // Helper: run the checker logic on a synthetic file string and return
  // violations just like the main loop does (no file-system involvement).
  function check(src: string): string[] {
    const viols: string[] = [];
    for (const { tagText, startIndex } of extractFieldTags(src)) {
      const type = getTypeAttr(tagText);

      if (type === "hidden") continue;

      const isCheckboxOrRadio = type === "checkbox" || type === "radio";
      const hasLabel =
        hasAttr(tagText, "aria-label") ||
        hasAttr(tagText, "aria-labelledby") ||
        hasAttr(tagText, "id");

      if (isCheckboxOrRadio && hasLabel) continue;
      if (isCheckboxOrRadio && !hasLabel) {
        viols.push(tagText.trim().slice(0, 120));
        continue;
      }

      if (hasLabel) continue;
      if (isInsideLabel(src, startIndex)) continue;

      viols.push(tagText.trim().slice(0, 120));
    }
    return viols;
  }

  // Case 1: placeholder alone → violation
  {
    const viols = check(`<input placeholder="x" />`);
    assert.equal(viols.length, 1, 'Self-check 1: <input placeholder="x" /> must be flagged');
  }

  // Case 2: aria-label → accepted
  {
    const viols = check(`<input aria-label="Search" />`);
    assert.equal(viols.length, 0, 'Self-check 2: <input aria-label="Search" /> must be accepted');
  }

  // Case 3: id → accepted
  {
    const viols = check(`<input id="a" />`);
    assert.equal(viols.length, 0, 'Self-check 3: <input id="a" /> must be accepted');
  }

  // Case 4: wrapped in <label> → accepted
  {
    const viols = check(`<label>Name <input /></label>`);
    assert.equal(viols.length, 0, 'Self-check 4: <label>Name <input /></label> must be accepted');
  }

  // Case 5: closed <label> does NOT count
  {
    const viols = check(`<label>Name</label>\n<input />`);
    assert.equal(viols.length, 1, "Self-check 5: closed <label> followed by <input /> must be flagged");
  }

  // Case 6: type="hidden" → always skip
  {
    const viols = check(`<input type="hidden" />`);
    assert.equal(viols.length, 0, 'Self-check 6: type="hidden" must always be skipped');
  }

  // Case 7: checkbox with id → skip
  {
    const viols = check(`<input type="checkbox" id="cb" />`);
    assert.equal(viols.length, 0, 'Self-check 7: checkbox with id must be skipped');
  }

  // Case 8: checkbox WITHOUT any label attribute → violation
  {
    const viols = check(`<input type="checkbox" />`);
    assert.equal(viols.length, 1, "Self-check 8: unlabelled checkbox must be flagged");
  }

  // Case 9: arrow function inside attribute does not break tag parsing
  {
    const viols = check(`<input onChange={(e) => setValue(e.target.value)} aria-label="val" />`);
    assert.equal(viols.length, 0, "Self-check 9: arrow function inside attr must not break parsing");
  }

  // Case 10: <select> with aria-labelledby → accepted
  {
    const viols = check(`<select aria-labelledby="lbl"><option>x</option></select>`);
    assert.equal(viols.length, 0, 'Self-check 10: <select aria-labelledby> must be accepted');
  }

  console.log("Self-checks: all 10 passed.");
}

// ---------------------------------------------------------------------------
// Main: scan real .tsx files
// ---------------------------------------------------------------------------

runSelfChecks();

const SRC_DIR = path.resolve(process.cwd(), "src");

if (!fs.existsSync(SRC_DIR)) {
  throw new Error(`src/ directory not found at ${SRC_DIR}. Run from the repo root.`);
}

const tsxFiles = collectTsx(SRC_DIR);

const violations: string[] = [];
let totalChecked = 0;

for (const filePath of tsxFiles) {
  const src = fs.readFileSync(filePath, "utf8");
  const tags = extractFieldTags(src);
  const lines = src.split("\n");

  // Build an index: character offset → line number (1-based)
  const lineStartOffsets: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineStartOffsets.push(lineStartOffsets[i] + lines[i].length + 1);
  }

  function offsetToLine(offset: number): number {
    let lo = 0;
    let hi = lineStartOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStartOffsets[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-based
  }

  for (const { tagText, startIndex } of tags) {
    const type = getTypeAttr(tagText);

    // Rule 1: always skip hidden inputs
    if (type === "hidden") continue;

    totalChecked++;

    const isCheckboxOrRadio = type === "checkbox" || type === "radio";
    const hasLabel =
      hasAttr(tagText, "aria-label") ||
      hasAttr(tagText, "aria-labelledby") ||
      hasAttr(tagText, "id");

    // Rule 2: checkbox/radio — skip only if labelled
    if (isCheckboxOrRadio) {
      if (hasLabel) continue;
      const line = offsetToLine(startIndex);
      const rel = path.relative(process.cwd(), filePath);
      violations.push(`${rel}:${line}: ${tagText.trim().slice(0, 120)}`);
      continue;
    }

    // Rule 3: all other fields — need aria-label, aria-labelledby, id, or <label> wrapper
    if (hasLabel) continue;
    if (isInsideLabel(src, startIndex)) continue;

    const line = offsetToLine(startIndex);
    const rel = path.relative(process.cwd(), filePath);
    violations.push(`${rel}:${line}: ${tagText.trim().slice(0, 120)}`);
  }
}

console.log(`Fields checked: ${totalChecked}`);

assert.ok(
  totalChecked >= 5,
  `Parser sanity check: expected at least 5 field tags across all .tsx files, found ${totalChecked}. ` +
    `This likely means the parser is broken or the src/ directory is empty.`
);

assert.deepEqual(
  violations,
  [],
  `Form-field labelling violations (${violations.length}):\n` +
    violations.map((v) => `  • ${v}`).join("\n")
);

console.log("All form-field labelling checks passed.");
