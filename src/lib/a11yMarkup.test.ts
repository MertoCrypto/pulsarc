/**
 * Accessibility drift test for the Pulsarc site.
 *
 * Run from repo root:
 *   node --experimental-strip-types src/lib/a11yMarkup.test.ts
 *
 * Reads every .tsx file under src/ at runtime with node:fs.
 * Collects ALL violations, then fails once with assert.deepEqual.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// 1.  JSX tag extractor
//     Walks the raw source character-by-character, tracking brace depth so
//     that `{...}` expressions (including `() => …`) are treated as opaque
//     atoms.  This means ">" inside an attribute value or arrow function does
//     NOT end the tag early, and tags may span multiple lines.
// ---------------------------------------------------------------------------

interface ExtractedTag {
  name: "img" | "button";
  text: string; // full tag text (opening tag only)
  line: number; // 1-based line of the "<"
  // For button only: text between opening tag and </button>
  bodyText?: string;
}

/**
 * Extract every <img …> and <button …> opening tag from source text.
 *
 * For <button> tags we also capture the body up to </button> so we can
 * determine whether there is visible text content.
 */
function extractTags(source: string): ExtractedTag[] {
  const results: ExtractedTag[] = [];
  const len = source.length;

  // Pre-build a line-start index so we can cheaply map offset → line number.
  const lineStarts: number[] = [0];
  for (let i = 0; i < len; i++) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }

  function offsetToLine(offset: number): number {
    let lo = 0,
      hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  let i = 0;
  while (i < len) {
    // Look for a "<" that starts a JSX tag we care about.
    if (source[i] !== "<") {
      i++;
      continue;
    }

    // Determine what tag name follows.
    const afterAngle = i + 1;

    // Skip comments <!-- … -->
    if (source.startsWith("!--", afterAngle)) {
      const end = source.indexOf("-->", afterAngle + 3);
      i = end === -1 ? len : end + 3;
      continue;
    }

    // Match "img" or "button" followed by a whitespace, "/" or ">"
    let tagName: "img" | "button" | null = null;
    if (
      source.startsWith("img", afterAngle) &&
      /[\s/>]/.test(source[afterAngle + 3] ?? "")
    ) {
      tagName = "img";
    } else if (
      source.startsWith("button", afterAngle) &&
      /[\s/>]/.test(source[afterAngle + 6] ?? "")
    ) {
      tagName = "button";
    }

    if (tagName === null) {
      i++;
      continue;
    }

    const tagStart = i;
    const tagLine = offsetToLine(tagStart);

    // Walk through the opening tag, respecting brace depth and string literals.
    // We stop when we hit a ">" that is at brace depth 0 and not inside a string.
    let j = afterAngle + tagName.length; // position right after tag name
    let braceDepth = 0;
    let inString: '"' | "'" | "`" | null = null;
    let selfClosing = false;

    outer: while (j < len) {
      const ch = source[j];

      if (inString !== null) {
        if (ch === "\\" ) {
          j += 2; // skip escape sequence
          continue;
        }
        if (ch === inString) {
          inString = null;
        }
        j++;
        continue;
      }

      // Not in a string
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        j++;
        continue;
      }

      if (ch === "{") {
        braceDepth++;
        j++;
        continue;
      }
      if (ch === "}") {
        braceDepth--;
        j++;
        continue;
      }

      if (braceDepth > 0) {
        // Inside a JSX expression; consume without interpretation.
        j++;
        continue;
      }

      // At brace depth 0
      if (ch === "/" && source[j + 1] === ">") {
        selfClosing = true;
        j += 2;
        break outer;
      }
      if (ch === ">") {
        j++;
        break outer;
      }

      j++;
    }

    const openingTagText = source.slice(tagStart, j);

    // For button tags, also capture the body (up to </button>).
    let bodyText: string | undefined;
    if (tagName === "button" && !selfClosing) {
      // Find the matching </button> using a simple nesting counter.
      // We look for <button (open) and </button> (close) from position j.
      let depth = 1;
      let k = j;
      while (k < len && depth > 0) {
        if (source.startsWith("</button>", k)) {
          depth--;
          if (depth === 0) break;
          k += 9;
        } else if (
          source.startsWith("<button", k) &&
          /[\s/>]/.test(source[k + 7] ?? "")
        ) {
          depth++;
          k++;
        } else {
          k++;
        }
      }
      bodyText = source.slice(j, k);
    } else if (tagName === "button" && selfClosing) {
      bodyText = ""; // self-closing button has no content
    }

    results.push({
      name: tagName,
      text: openingTagText,
      line: tagLine,
      bodyText,
    });

    i = j;
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2.  Attribute helpers
// ---------------------------------------------------------------------------

/** Return true if the opening tag text contains the given attribute name. */
function hasAttr(tagText: string, attrName: string): boolean {
  // Match `attrName` as a whole word (preceded by whitespace, followed by
  // whitespace / "=" / "/" / ">").
  const re = new RegExp(`(?:^|\\s)${escapeRe(attrName)}(?=[\\s=/>])`, "s");
  return re.test(tagText);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// 3.  Body text analysis (for buttons)
// ---------------------------------------------------------------------------

/**
 * Determine whether a button body has visible text content.
 *
 * "Visible text" means characters outside JSX tags and {…} expressions that
 * contain at least one letter.
 *
 * Heuristic: if the body contains a `{expression}` we conservatively consider
 * it to have potential text content (the expression might render a label string).
 */
function bodyHasText(body: string): boolean {
  if (!body) return false;

  // Strip JSX tags (<…>) — respecting brace depth inside attributes.
  // We'll remove them in a single pass.
  let stripped = "";
  let i = 0;
  const len = body.length;

  while (i < len) {
    if (body[i] === "<") {
      // Skip to end of tag
      let j = i + 1;
      let braceDepth = 0;
      let inString: '"' | "'" | null = null;
      while (j < len) {
        const ch = body[j];
        if (inString) {
          if (ch === "\\" ) { j += 2; continue; }
          if (ch === inString) inString = null;
          j++;
          continue;
        }
        if (ch === '"' || ch === "'") { inString = ch; j++; continue; }
        if (ch === "{") { braceDepth++; j++; continue; }
        if (ch === "}") { braceDepth--; j++; continue; }
        if (braceDepth === 0 && ch === ">") { j++; break; }
        j++;
      }
      i = j;
    } else {
      stripped += body[i];
      i++;
    }
  }

  // Now stripped contains raw text + {expressions}.
  // If any {expression} is present, treat as potentially having text.
  if (/\{[^}]+\}/.test(stripped)) return true;

  // Otherwise check for letters in the remaining text.
  return /[a-zA-Z]/.test(stripped);
}

// ---------------------------------------------------------------------------
// 4.  File walker
// ---------------------------------------------------------------------------

function walkTsx(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsx(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 5.  Self-check (in-file unit tests on sample strings)
//     These run before the real-file scan and will throw immediately if the
//     extractor logic is broken.
// ---------------------------------------------------------------------------

function runSelfChecks(): void {
  // --- extractor self-checks ---

  // Arrow function in attribute must NOT end the tag early.
  const sample1 = `<button onClick={() => go()}><Icon /></button>`;
  const tags1 = extractTags(sample1);
  assert.equal(tags1.length, 1, "self-check: should extract exactly 1 button from sample1");
  assert.equal(tags1[0].name, "button");

  // Self-closing button (no body content).
  const sample2 = `<button aria-label="Close"><Icon /></button>`;
  const tags2 = extractTags(sample2);
  assert.equal(tags2.length, 1, "self-check: should extract 1 button from sample2");

  // Plain text button.
  const sample3 = `<button>Save</button>`;
  const tags3 = extractTags(sample3);
  assert.equal(tags3.length, 1, "self-check: should extract 1 button from sample3");

  // --- img self-checks ---
  const sampleImg1 = `<img src="logo.png" />`;
  const tagsImg1 = extractTags(sampleImg1);
  assert.equal(tagsImg1.length, 1, "self-check: should extract 1 img");
  assert.equal(tagsImg1[0].name, "img");

  const sampleImg2 = `<img src="logo.png" alt="" />`;
  const tagsImg2 = extractTags(sampleImg2);
  assert.equal(tagsImg2.length, 1);
  assert(hasAttr(tagsImg2[0].text, "alt"), "self-check: alt present");

  // --- violation self-checks ---

  // icon-only button with no label → VIOLATION
  const viol1 = extractTags(`<button onClick={() => go()}><Icon /></button>`)[0];
  assert(viol1 !== undefined);
  const viol1HasText = bodyHasText(viol1.bodyText ?? "");
  assert.equal(viol1HasText, false, "self-check: icon-only button body should have no text");
  assert(
    !hasAttr(viol1.text, "aria-label") &&
      !hasAttr(viol1.text, "aria-labelledby") &&
      !hasAttr(viol1.text, "title"),
    "self-check: icon-only button should lack all labels"
  );

  // button with aria-label → OK
  const ok1 = extractTags(`<button aria-label="Close"><Icon /></button>`)[0];
  assert(ok1 !== undefined);
  assert(hasAttr(ok1.text, "aria-label"), "self-check: aria-label should be present");

  // button with text content → OK
  const ok2 = extractTags(`<button>Save</button>`)[0];
  assert(ok2 !== undefined);
  assert(bodyHasText(ok2.bodyText ?? ""), "self-check: text button should have text");

  // img without alt → VIOLATION
  const imgViol = extractTags(`<img src="x.png" />`)[0];
  assert(imgViol !== undefined);
  assert(!hasAttr(imgViol.text, "alt"), "self-check: img without alt should lack alt attr");

  // img with aria-hidden → OK (alt not required)
  const imgAriaHidden = extractTags(`<img src="x.png" aria-hidden="true" />`)[0];
  assert(imgAriaHidden !== undefined);
  assert(hasAttr(imgAriaHidden.text, "aria-hidden"), "self-check: aria-hidden present");

  console.log("  [self-checks passed]");
}

// ---------------------------------------------------------------------------
// 6.  Main scan
// ---------------------------------------------------------------------------

function main(): void {
  console.log("Running accessibility drift test…\n");

  // Run self-checks first.
  runSelfChecks();

  // Locate the src/ directory relative to this file.
  // __filename works with --experimental-strip-types in Node 22+.
  const srcDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  const tsxFiles = walkTsx(srcDir);
  console.log(`  Scanning ${tsxFiles.length} .tsx file(s) under ${srcDir}`);

  const violations: string[] = [];
  let imgCount = 0;
  let buttonCount = 0;

  for (const filePath of tsxFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    const relPath = path.relative(path.resolve(srcDir, ".."), filePath); // relative to project root
    const tags = extractTags(source);

    for (const tag of tags) {
      const tagSnippet = tag.text.trimEnd().slice(0, 120);

      if (tag.name === "img") {
        imgCount++;

        // alt is not required when aria-hidden is present
        const isAriaHidden =
          hasAttr(tag.text, 'aria-hidden="true"') ||
          hasAttr(tag.text, "aria-hidden");

        if (!isAriaHidden && !hasAttr(tag.text, "alt")) {
          violations.push(
            `[img missing alt] ${relPath}:${tag.line}  ${tagSnippet}`
          );
        }
      } else if (tag.name === "button") {
        buttonCount++;

        const hasContent = bodyHasText(tag.bodyText ?? "");
        if (!hasContent) {
          const hasLabel =
            hasAttr(tag.text, "aria-label") ||
            hasAttr(tag.text, "aria-labelledby") ||
            hasAttr(tag.text, "title");
          if (!hasLabel) {
            violations.push(
              `[button no accessible name] ${relPath}:${tag.line}  ${tagSnippet}`
            );
          }
        }
      }
    }
  }

  console.log(`\n  img tags checked:    ${imgCount}`);
  console.log(`  button tags checked: ${buttonCount}`);

  // Guard: parser must have found a meaningful number of tags.
  // Relax the minimums when there are fewer than 3 tsx files scanned
  // (this scaffold project is nearly empty).
  const minImg = tsxFiles.length >= 3 ? 3 : 0;
  const minButton = tsxFiles.length >= 10 ? 30 : 0;

  if (tsxFiles.length >= 3) {
    assert(
      imgCount >= minImg,
      `Expected at least ${minImg} <img> tags, found ${imgCount}. ` +
        `Parser may be broken or the codebase genuinely has no images yet.`
    );
  }
  if (tsxFiles.length >= 10) {
    assert(
      buttonCount >= minButton,
      `Expected at least ${minButton} <button> tags, found ${buttonCount}. ` +
        `Parser may be broken or the codebase genuinely has no buttons yet.`
    );
  }

  console.log(
    violations.length === 0
      ? "\n  No violations found."
      : `\n  ${violations.length} violation(s):\n` +
          violations.map((v) => `    ${v}`).join("\n")
  );

  // Fail once with the full list.
  assert.deepEqual(
    violations,
    [],
    `Accessibility violations found (${violations.length}):\n` +
      violations.map((v) => `  ${v}`).join("\n")
  );

  console.log("\nAll accessibility checks passed.");
}

main();
