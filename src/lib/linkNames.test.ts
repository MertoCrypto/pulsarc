/**
 * Link-name drift test for the Pulsarc site.
 *
 * Every <a>, <Link>, and <NavLink> element found in *.tsx files under src/
 * must have an accessible name.  Run from the repo root:
 *
 *   node --experimental-strip-types src/lib/linkNames.test.ts
 *
 * A link has an accessible name when ANY of the following is true:
 *   • its opening tag carries aria-label, aria-labelledby, or title
 *   • its text content (outside JSX tags and outside {...} expressions)
 *     contains at least one visible letter
 *   • its content contains a {expression} that is not a bare icon reference
 *     (bare-icon heuristic: a single {Identifier} or {a.b} that looks like a
 *      component name — starts with an uppercase letter — is treated as an
 *      icon-only expression; everything else is treated as text)
 *   • its content contains a nested element that carries aria-label or has a
 *     class containing "sr-only"
 *
 * Self-closing <a /> is a violation unless the opening tag has aria-label.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  tag: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Recursively collect every *.tsx file under `dir`. */
function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

/** Count newlines before `index` to get 1-based line number. */
function lineAt(src: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (src[i] === '\n') n++;
  return n;
}

// ---------------------------------------------------------------------------
// Tag-content extraction with brace-depth tracking
// ---------------------------------------------------------------------------

/**
 * Given the source string and the position of the '<' of an opening tag,
 * return the index just after the '>' that closes the opening tag, tracking
 * brace depth so `=>` inside `{...}` is not misread as the end of a prop.
 * Returns -1 if the tag is self-closing (ends with '/>').
 */
function findOpeningTagEnd(src: string, start: number): { end: number; selfClosing: boolean } {
  let i = start + 1; // skip '<'
  let braceDepth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }
    if (braceDepth > 0) { i++; continue; }
    if (ch === '/' && src[i + 1] === '>') {
      return { end: i + 2, selfClosing: true };
    }
    if (ch === '>') {
      return { end: i + 1, selfClosing: false };
    }
    // skip string literals in props to avoid false '>' matches
    if ((ch === '"' || ch === "'") && braceDepth === 0) {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++; // closing quote
      continue;
    }
    i++;
  }
  return { end: i, selfClosing: false };
}

/**
 * Given the source and the position just after the opening tag's '>',
 * find the position of the matching closing tag for `tagName`.
 * Handles nesting of the same tag name.
 */
function findClosingTag(src: string, afterOpen: number, tagName: string): number {
  const openRe = new RegExp(`<${tagName}[\\s/>]`, 'g');
  const closeRe = new RegExp(`</${tagName}\\s*>`, 'g');
  let depth = 1;
  let pos = afterOpen;
  while (pos < src.length && depth > 0) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const openMatch = openRe.exec(src);
    const closeMatch = closeRe.exec(src);
    if (!closeMatch) break;
    if (openMatch && openMatch.index < closeMatch.index) {
      depth++;
      pos = openMatch.index + 1;
    } else {
      depth--;
      if (depth === 0) return closeMatch.index;
      pos = closeMatch.index + 1;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Accessible-name analysis
// ---------------------------------------------------------------------------

/** Return true if the opening tag text (from '<' to '>') carries an accessible-name attribute. */
function openingTagHasNameAttr(openingTag: string): boolean {
  return /\baria-label\s*=/.test(openingTag) ||
    /\baria-labelledby\s*=/.test(openingTag) ||
    /\btitle\s*=/.test(openingTag);
}

/**
 * Analyse the inner content of a link (between the opening '>' and the closing tag).
 * Returns true when an accessible name is present.
 */
function contentHasAccessibleName(content: string): boolean {
  // 1. Visible text outside JSX tags and outside {} expressions
  const visibleText = stripTagsAndExpressions(content);
  if (/[A-Za-z]/.test(visibleText)) return true;

  // 2. Nested element with aria-label or sr-only class
  if (/\baria-label\s*=/.test(content)) return true;
  if (/\bsr-only\b/.test(content)) return true;

  // 3. {expression} that is NOT a bare icon component reference
  //    Bare icon: {SomeUpperCase} or {some.Upper} or {some.path.Icon}
  const exprRe = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = exprRe.exec(content)) !== null) {
    const expr = m[1].trim();
    // Heuristic: bare identifier starting with uppercase → icon
    if (/^[A-Z][A-Za-z0-9]*$/.test(expr)) continue;
    // Heuristic: member expression like foo.Bar or foo.bar.Baz → icon
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)+$/.test(expr)) {
      // if the final segment is uppercase it is still icon-like
      const segments = expr.split('.');
      const last = segments[segments.length - 1];
      if (/^[A-Z]/.test(last)) continue;
    }
    // Everything else (string, template literal, function call, conditional, etc.)
    return true;
  }

  return false;
}

/**
 * Remove JSX tags and {…} expressions from a string and return the
 * remaining literal text (potential visible characters).
 */
function stripTagsAndExpressions(src: string): string {
  // Remove JSX tags (not perfectly nested-aware but sufficient for plain text extraction)
  let s = src.replace(/<[^>]*>/g, '');
  // Remove brace-depth-aware {…} blocks
  let out = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') { depth++; continue; }
    if (s[i] === '}') { depth--; continue; }
    if (depth === 0) out += s[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

const LINK_TAGS = ['a', 'Link', 'NavLink'];

interface LinkOccurrence {
  file: string;
  line: number;
  raw: string;       // trimmed to 120 chars
  hasName: boolean;
}

function scanFile(filePath: string, src: string): LinkOccurrence[] {
  const results: LinkOccurrence[] = [];

  for (const tagName of LINK_TAGS) {
    // Match the start of an opening tag: '<a ', '<a\n', '<a>', '<a/>', '<Link ', …
    const tagStartRe = new RegExp(`<${tagName}(?=[\\s/>])`, 'g');
    let m: RegExpExecArray | null;

    while ((m = tagStartRe.exec(src)) !== null) {
      const tagStart = m.index;
      const line = lineAt(src, tagStart);

      const { end: openEnd, selfClosing } = findOpeningTagEnd(src, tagStart);
      const openingTag = src.slice(tagStart, openEnd);

      if (selfClosing) {
        // Self-closing: accessible only if it has aria-label (etc.) on the tag itself
        const hasName = openingTagHasNameAttr(openingTag);
        const raw = openingTag.trim().slice(0, 120);
        results.push({ file: filePath, line, raw, hasName });
        continue;
      }

      // Find the inner content
      const closePos = findClosingTag(src, openEnd, tagName);
      let content = closePos === -1 ? '' : src.slice(openEnd, closePos);

      const hasName = openingTagHasNameAttr(openingTag) || contentHasAccessibleName(content);
      const fullTag = src.slice(tagStart, closePos === -1 ? openEnd : closePos + `</${tagName}>`.length);
      const raw = fullTag.trim().slice(0, 120);
      results.push({ file: filePath, line, raw, hasName });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Self-checks (run before touching real files)
// ---------------------------------------------------------------------------

function runSelfChecks(): void {
  // Helper: scan a synthetic snippet
  function check(snippet: string): boolean {
    const occurrences = scanFile('__self_check__', snippet);
    if (occurrences.length === 0) throw new Error(`Self-check: no link found in: ${snippet}`);
    return occurrences[0].hasName;
  }

  // 1. Icon-only <a> → violation
  assert.equal(
    check('<a href="x"><Icon /></a>'),
    false,
    'Self-check 1 failed: <a href="x"><Icon /></a> should be a violation',
  );

  // 2. <a aria-label="GitHub"> → accepted
  assert.equal(
    check('<a href="x" aria-label="GitHub"><Icon /></a>'),
    true,
    'Self-check 2 failed: aria-label should be accepted',
  );

  // 3. <Link to="/a">Home</Link> → accepted
  assert.equal(
    check('<Link to="/a">Home</Link>'),
    true,
    'Self-check 3 failed: text content should be accepted',
  );

  // 4. <a> with sr-only nested span → accepted
  assert.equal(
    check('<a href="x"><Icon /><span className="sr-only">Docs</span></a>'),
    true,
    'Self-check 4 failed: sr-only class should provide accessible name',
  );

  console.log('Self-checks passed (4/4).');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runSelfChecks();

const srcRoot = path.resolve(process.cwd(), 'src');
const tsxFiles = collectTsxFiles(srcRoot);

let allOccurrences: LinkOccurrence[] = [];
for (const file of tsxFiles) {
  const src = fs.readFileSync(file, 'utf8');
  allOccurrences.push(...scanFile(file, src));
}

const relPath = (abs: string) => path.relative(process.cwd(), abs);

const violations: Violation[] = allOccurrences
  .filter(o => !o.hasName)
  .map(o => ({ file: relPath(o.file), line: o.line, tag: o.raw }));

console.log(`Links checked: ${allOccurrences.length}`);

// Must find at least 30 links across the codebase
assert.ok(
  allOccurrences.length >= 30,
  `Expected at least 30 links to be found across src/**/*.tsx, but only found ${allOccurrences.length}. ` +
  `Run this test against a Pulsarc repo checkout.`,
);

// All links must have an accessible name
assert.deepEqual(
  violations,
  [],
  `Found ${violations.length} link(s) without an accessible name:\n` +
  violations.map(v => `  ${v.file}:${v.line}  ${v.tag}`).join('\n'),
);

console.log('All link-name checks passed.');
