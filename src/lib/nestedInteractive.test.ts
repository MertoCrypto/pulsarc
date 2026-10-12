/**
 * Nested-interactive-element drift test
 *
 * Checks that no interactive element (<button>, <a>, <Link>, <NavLink>) contains
 * another interactive element as a descendant in JSX source.  Invalid HTML and
 * unusable with assistive technology.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/nestedInteractive.test.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  outerTag: string;
  innerTag: string;
}

// ---------------------------------------------------------------------------
// Helpers: walk the file tree
// ---------------------------------------------------------------------------

function* walkTsx(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTsx(full);
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers: line-number lookup
// ---------------------------------------------------------------------------

function lineOf(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Core parser: find opening tags with brace-depth tracking
//
// The challenge: JSX attribute values can contain ">" inside {…} expressions,
// e.g.  <button onClick={() => foo()}>  — the ">" inside the arrow function
// must NOT end the tag.  We track brace depth so that only a ">" at
// brace-depth 0 terminates the opening tag.
//
// Returns: array of { tagName, openStart, openEnd, contentStart }
//   openStart  = index of "<"
//   openEnd    = index just after the ">" that closes the opening tag
//   contentStart = openEnd  (content begins immediately after)
// ---------------------------------------------------------------------------

interface TagOpen {
  tagName: string;
  openStart: number;   // index of "<"
  openEnd: number;     // index just past the closing ">" of the open tag
  contentStart: number;
}

/**
 * Parse a raw TSX source string and find every opening tag whose name matches
 * one of the given tag names (exact match, case-sensitive).
 *
 * Tags that are self-closing (<Foo />) are excluded — they have no content.
 */
function findOpenTags(src: string, tagNames: string[]): TagOpen[] {
  const result: TagOpen[] = [];
  const nameSet = new Set(tagNames);
  let i = 0;

  while (i < src.length) {
    // Find the next "<"
    const lt = src.indexOf("<", i);
    if (lt === -1) break;

    // Check for comment <!-- or CDATA, skip
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }

    // Must be followed by a letter (element start, not </foo>, <!-- …)
    const ch = src[lt + 1];
    if (!ch || ch === "/" || ch === "!" || ch === "?") {
      i = lt + 1;
      continue;
    }

    // Extract tag name: everything up to the first whitespace, ">" or "/"
    let nameEnd = lt + 1;
    while (nameEnd < src.length && !/[\s>/]/.test(src[nameEnd])) nameEnd++;
    const tagName = src.slice(lt + 1, nameEnd);

    if (!nameSet.has(tagName)) {
      i = lt + 1;
      continue;
    }

    // Walk forward to find the ">" that closes this opening tag,
    // respecting brace depth so that ">" inside {…} is ignored.
    let j = nameEnd;
    let braceDepth = 0;
    let inString: string | null = null;
    let selfClosing = false;

    outer: while (j < src.length) {
      const c = src[j];

      if (inString) {
        if (c === "\\" && inString !== "`") { j += 2; continue; }
        if (c === inString) inString = null;
        j++;
        continue;
      }

      switch (c) {
        case '"': case "'": case "`":
          inString = c;
          break;
        case "{":
          braceDepth++;
          break;
        case "}":
          if (braceDepth > 0) braceDepth--;
          break;
        case "/":
          if (braceDepth === 0 && src[j + 1] === ">") {
            selfClosing = true;
            j += 2;
            break outer;
          }
          break;
        case ">":
          if (braceDepth === 0) {
            j++;
            break outer;
          }
          break;
      }
      j++;
    }

    if (!selfClosing) {
      result.push({
        tagName,
        openStart: lt,
        openEnd: j,
        contentStart: j,
      });
    }

    i = lt + 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Find the matching closing tag, respecting nesting depth
//
// Starting from contentStart, scan forward until we find the </tagName>
// that closes this particular element (depth = 0).  We track openings and
// closings of the same tag name to handle nesting (e.g. <button> inside
// <button> would increment depth).  Brace-depth tracking applies the same
// logic so that ">" inside {…} doesn't accidentally match a close tag.
// ---------------------------------------------------------------------------

function findCloseTag(src: string, tagName: string, contentStart: number): number {
  const openPattern = `<${tagName}`;
  const closePattern = `</${tagName}`;
  let depth = 1; // we are already inside one open tag
  let i = contentStart;

  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf(openPattern, i);
    const nextClose = src.indexOf(closePattern, i);

    if (nextClose === -1) {
      // No closing tag found — malformed, bail
      return src.length;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Another open tag for the same element — but only if it is really an
      // opening tag, not an attribute value or a comment.
      // Quick sanity: character after tagName must be whitespace, ">" or "/"
      const afterName = src[nextOpen + openPattern.length];
      if (afterName && /[\s>/]/.test(afterName)) {
        // Check it is not self-closing by scanning to its ">"
        let k = nextOpen + openPattern.length;
        let braceD = 0;
        let inStr: string | null = null;
        let selfClose = false;

        while (k < src.length) {
          const c = src[k];
          if (inStr) {
            if (c === "\\" && inStr !== "`") { k += 2; continue; }
            if (c === inStr) inStr = null;
            k++;
            continue;
          }
          if (c === '"' || c === "'" || c === "`") { inStr = c; k++; continue; }
          if (c === "{") { braceD++; k++; continue; }
          if (c === "}") { if (braceD > 0) braceD--; k++; continue; }
          if (c === "/" && src[k + 1] === ">") { selfClose = true; k += 2; break; }
          if (c === ">" && braceD === 0) { k++; break; }
          k++;
        }
        if (!selfClose) depth++;
      }
      i = nextOpen + 1;
    } else {
      // The close tag comes next (or there was no open tag between here and it)
      depth--;
      if (depth === 0) {
        // Return position just past the ">" of the closing tag
        const gt = src.indexOf(">", nextClose + closePattern.length);
        return gt === -1 ? src.length : gt + 1;
      }
      i = nextClose + 1;
    }
  }

  return src.length;
}

// ---------------------------------------------------------------------------
// Inner-tag detection
//
// Check whether a content substring contains any of the given forbidden
// inner tag names as non-self-closing opening tags.
// Returns the name of the first found inner tag, or null.
//
// Strategy: search for "<tagName" then confirm the character immediately
// after the tag name is a valid JSX tag boundary (whitespace, ">", "/",
// or "{" for a spread attribute).  This avoids false positives on names
// like "<anchor" when looking for "<a".
// ---------------------------------------------------------------------------

// Tag names whose presence (as non-self-closing openers) inside a button or
// link constitutes a violation.
const FORBIDDEN_INNER_TAG_NAMES = ["button", "a", "Link", "NavLink", "input"] as const;

/**
 * Return the tag name of the first forbidden non-self-closing inner element
 * found in `content`, or null if none.
 */
function findForbiddenInner(content: string, forbidden: ReadonlyArray<string>): string | null {
  for (const tagName of forbidden) {
    const prefix = `<${tagName}`;
    let pos = 0;
    while (true) {
      const idx = content.indexOf(prefix, pos);
      if (idx === -1) break;

      // The character immediately after the tag name must be a tag-boundary
      // character: whitespace, ">", "/" (self-close), or "{" (spread attr).
      // This prevents "<anchor" from matching "<a".
      const afterTagName = content[idx + prefix.length];
      const validBoundary =
        afterTagName === undefined ||
        afterTagName === ">" ||
        afterTagName === "/" ||
        afterTagName === "{" ||
        /\s/.test(afterTagName);
      if (!validBoundary) { pos = idx + 1; continue; }

      // Walk forward to determine whether this is a self-closing tag.
      // Track brace depth and string literals so that ">" or "/" inside
      // attribute expressions (e.g. onClick={() => fn()}) is ignored.
      let k = idx + prefix.length;
      let braceD = 0;
      let inStr: string | null = null;
      let selfClose = false;

      while (k < content.length) {
        const c = content[k];
        if (inStr) {
          if (c === "\\" && inStr !== "`") { k += 2; continue; }
          if (c === inStr) inStr = null;
          k++;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") { inStr = c; k++; continue; }
        if (c === "{") { braceD++; k++; continue; }
        if (c === "}") { if (braceD > 0) braceD--; k++; continue; }
        if (c === "/" && content[k + 1] === ">") { selfClose = true; break; }
        if (c === ">" && braceD === 0) break;
        k++;
      }

      if (!selfClose) return tagName;
      pos = idx + 1;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Outer containers to check: button, a, Link, NavLink
// ---------------------------------------------------------------------------

// Tags whose CONTENT must not contain forbidden interactive children
const OUTER_BUTTON_LIKE = ["button"] as const;
const OUTER_LINK_LIKE   = ["a", "Link", "NavLink"] as const;

// Forbidden inner tag names for each outer type
const FORBIDDEN_INSIDE_BUTTON: ReadonlyArray<string> = ["a", "Link", "NavLink", "button", "input"];
const FORBIDDEN_INSIDE_LINK:   ReadonlyArray<string> = ["button"];

// ---------------------------------------------------------------------------
// Analyse a single file
// ---------------------------------------------------------------------------

function analyseFile(filePath: string, srcRoot: string): {
  violations: Violation[];
  buttonCount: number;
  linkCount: number;
} {
  const src = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(srcRoot, filePath);
  const violations: Violation[] = [];
  let buttonCount = 0;
  let linkCount = 0;

  // --- Check button-like outer containers ---
  for (const outerTag of OUTER_BUTTON_LIKE) {
    const opens = findOpenTags(src, [outerTag]);
    for (const open of opens) {
      buttonCount++;
      const closeEnd = findCloseTag(src, outerTag, open.contentStart);
      const content = src.slice(open.contentStart, closeEnd);
      const inner = findForbiddenInner(content, FORBIDDEN_INSIDE_BUTTON);
      if (inner) {
        violations.push({
          file: relPath,
          line: lineOf(src, open.openStart),
          outerTag,
          innerTag: inner,
        });
      }
    }
  }

  // --- Check link-like outer containers ---
  for (const outerTag of OUTER_LINK_LIKE) {
    const opens = findOpenTags(src, [outerTag]);
    for (const open of opens) {
      linkCount++;
      const closeEnd = findCloseTag(src, outerTag, open.contentStart);
      const content = src.slice(open.contentStart, closeEnd);
      const inner = findForbiddenInner(content, FORBIDDEN_INSIDE_LINK);
      if (inner) {
        violations.push({
          file: relPath,
          line: lineOf(src, open.openStart),
          outerTag,
          innerTag: inner,
        });
      }
    }
  }

  return { violations, buttonCount, linkCount };
}

// ---------------------------------------------------------------------------
// In-file self-checks (run before the real scan)
// ---------------------------------------------------------------------------

function runSelfChecks(): void {
  console.log("Running self-checks…");

  // Helper: run analyseFile on an in-memory string via a temp file
  const tmpDir = fs.mkdtempSync(path.join(
    // prefer /tmp, fall back to cwd
    fs.existsSync("/tmp") ? "/tmp" : ".",
    "nested-test-"
  ));
  const tmpFile = path.join(tmpDir, "sample.tsx");

  function check(label: string, source: string): {
    violations: Violation[]; buttonCount: number; linkCount: number
  } {
    fs.writeFileSync(tmpFile, source, "utf-8");
    return analyseFile(tmpFile, tmpDir);
  }

  try {
    // 1. <button><a href="x">y</a></button>  → flagged
    {
      const r = check("button-a", `<button><a href="x">y</a></button>`);
      assert.equal(r.violations.length, 1,
        `self-check FAIL: <button><a> should be flagged, got ${r.violations.length} violations`);
      assert.equal(r.violations[0].innerTag, "a",
        `self-check FAIL: inner tag should be "a", got "${r.violations[0].innerTag}"`);
      assert.equal(r.buttonCount, 1, `self-check FAIL: buttonCount should be 1`);
      console.log("  ✓  <button><a href='x'>y</a></button>  → flagged");
    }

    // 2. <button><span>y</span></button>  → accepted (no violation)
    {
      const r = check("button-span", `<button><span>y</span></button>`);
      assert.equal(r.violations.length, 0,
        `self-check FAIL: <button><span> should NOT be flagged, got ${r.violations.length} violations`);
      assert.equal(r.buttonCount, 1, `self-check FAIL: buttonCount should be 1`);
      console.log("  ✓  <button><span>y</span></button>  → accepted");
    }

    // 3. <a href="x"><button>y</button></a>  → flagged
    {
      const r = check("a-button", `<a href="x"><button>y</button></a>`);
      // The <a> scan finds a <button> inside it
      const linkViolations = r.violations.filter(v => v.outerTag !== "button");
      assert.ok(
        r.violations.some(v => (v.outerTag === "a" || v.outerTag === "Link") && v.innerTag === "button"),
        `self-check FAIL: <a><button> should be flagged; violations = ${JSON.stringify(r.violations)}`
      );
      console.log("  ✓  <a href='x'><button>y</button></a>  → flagged");
    }

    // 4. Arrow-function brace edge case: ">" inside {…} must NOT end the tag
    {
      const r = check("arrow-fn",
        `<button onClick={() => doThing()}><span>ok</span></button>`
      );
      assert.equal(r.violations.length, 0,
        `self-check FAIL: arrow-fn button with span should NOT be flagged`);
      assert.equal(r.buttonCount, 1, `self-check FAIL: buttonCount should be 1`);
      console.log("  ✓  <button onClick={() => doThing()}><span>ok</span></button>  → accepted");
    }

    // 5. Self-closing <input/> inside button → flagged
    //    Wait — <input /> is self-closing, so findForbiddenInner should catch it
    //    as *non* self-closing only when it is `<input >` (not self-closed).
    //    Confirm self-closing is NOT flagged.
    {
      const r = check("self-close-input",
        `<button><input type="text" /></button>`
      );
      // <input /> is self-closing — our parser skips it, so no violation
      assert.equal(r.violations.length, 0,
        `self-check FAIL: <input /> (self-closing) inside button should NOT be flagged`);
      console.log("  ✓  <button><input type=\"text\" /></button>  → accepted (self-closing input)");
    }

    // 6. Non-self-closing <input> inside button → flagged
    {
      const r = check("bare-input",
        `<button><input type="text"></button>`
      );
      assert.equal(r.violations.length, 1,
        `self-check FAIL: bare <input> inside button should be flagged, got ${r.violations.length}`);
      console.log("  ✓  <button><input type=\"text\"></button>  → flagged (bare input)");
    }

    // 7. <Link> wrapping a <button> → flagged
    {
      const r = check("link-button", `<Link href="/x"><button>go</button></Link>`);
      assert.ok(
        r.violations.some(v => v.outerTag === "Link" && v.innerTag === "button"),
        `self-check FAIL: <Link><button> should be flagged`
      );
      console.log("  ✓  <Link href='/x'><button>go</button></Link>  → flagged");
    }

    console.log("All self-checks passed.\n");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Main: scan the repo
// ---------------------------------------------------------------------------

function main(): void {
  runSelfChecks();

  // Resolve src/ relative to the current working directory (repo root)
  const srcRoot = path.resolve(process.cwd(), "src");

  if (!fs.existsSync(srcRoot)) {
    throw new Error(
      `Cannot find src/ directory at ${srcRoot}. ` +
      `Run this test from the repo root.`
    );
  }

  const tsxFiles = [...walkTsx(srcRoot)];
  console.log(`Scanning ${tsxFiles.length} .tsx file(s) under ${srcRoot}…\n`);

  const allViolations: Violation[] = [];
  let totalButtons = 0;
  let totalLinks = 0;

  for (const file of tsxFiles) {
    const { violations, buttonCount, linkCount } = analyseFile(file, srcRoot);
    allViolations.push(...violations);
    totalButtons += buttonCount;
    totalLinks   += linkCount;
  }

  console.log(`Checked: ${totalButtons} <button> element(s), ${totalLinks} <a>/<Link>/<NavLink> element(s)`);
  console.log(`Violations found: ${allViolations.length}`);

  if (allViolations.length > 0) {
    console.log("\nViolations:");
    for (const v of allViolations) {
      console.log(`  ${v.file}:${v.line}  <${v.outerTag}> contains <${v.innerTag}>`);
    }
    console.log();
  }

  // --- Assertion 1: no nested interactive elements ---
  assert.deepEqual(
    allViolations,
    [],
    [
      `Found ${allViolations.length} nested-interactive-element violation(s):`,
      ...allViolations.map(v =>
        `  ${v.file}:${v.line}  outer=<${v.outerTag}>  inner=<${v.innerTag}>`
      ),
    ].join("\n")
  );

  // --- Assertion 2: we checked a meaningful number of buttons ---
  assert.ok(
    totalButtons >= 50,
    `Expected at least 50 <button> elements across all .tsx files, ` +
    `but only found ${totalButtons}. ` +
    `Check that the test is run from the correct repo root and that ` +
    `src/ contains real application source.`
  );

  console.log("\nAll assertions passed.");
}

main();
