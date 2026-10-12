/**
 * Wording guard for the Pulsarc site.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/forbiddenWording.test.ts
 *
 * Scans:
 *   - every .tsx file found recursively under src/
 *   - public/llms.txt  (if present)
 *   - index.html       (if present)
 *
 * Forbidden phrases (details below):
 *   - "TVL"           case-SENSITIVE, whole word only
 *   - "value locked"  case-insensitive
 *   - "airdrop"       case-insensitive
 *   - "eligible"      case-insensitive
 *   - "eligibility"   case-insensitive
 *
 * For .tsx files, JS/TS comments are stripped before scanning so that
 * developer comments (// TVL, /* TVL *\/, {/* TVL *\/}) do not trigger
 * false positives. Strings and JSX text are kept.
 *
 * Non-.tsx files (llms.txt, index.html) are scanned as-is.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

// ── Comment stripper ─────────────────────────────────────────────────────────
//
// Removes JS/TS comments from source text without touching string literals or
// JSX text content.  Handles:
//   1.  // single-line comments  (stops at newline; newline is preserved)
//   2.  /* block comments */     (may span lines; content replaced with spaces
//                                 to preserve line numbers)
//   3.  {/* JSX block comments */}  (same as block comment, braces also removed)
//
// Strategy: walk the string character-by-character, tracking whether we are
// inside a string literal (', ", `), a regex literal is NOT handled (not
// needed — we only care about user-visible text), or a comment.

function stripComments(src: string): string {
  const out: string[] = []
  let i = 0
  const n = src.length

  while (i < n) {
    const ch = src[i]

    // ── String literals: pass through verbatim ──────────────────────────────
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      out.push(ch)
      i++
      while (i < n) {
        const c = src[i]
        out.push(c)
        if (c === '\\') {
          // escape: consume the next char too
          i++
          if (i < n) { out.push(src[i]); i++ }
          continue
        }
        if (c === quote) { i++; break }
        i++
      }
      continue
    }

    // ── JSX {/* ... */} comments ────────────────────────────────────────────
    // Detected as `{` followed (possibly with whitespace) by `/*`
    if (ch === '{') {
      // Look ahead for optional whitespace then /*
      let j = i + 1
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++
      if (src[j] === '/' && src[j + 1] === '*') {
        // consume the opening brace and /* — replacing with spaces/newlines
        // to keep line numbers intact
        const start = i
        // Skip to closing */
        let k = j + 2
        while (k < n) {
          if (src[k] === '*' && src[k + 1] === '/') {
            k += 2; break
          }
          k++
        }
        // Also consume the closing `}` if present
        while (k < n && (src[k] === ' ' || src[k] === '\t')) k++
        if (k < n && src[k] === '}') k++
        // Emit whitespace/newlines only to preserve line structure
        for (let m = start; m < k; m++) {
          out.push(src[m] === '\n' ? '\n' : ' ')
        }
        i = k
        continue
      }
    }

    // ── Block comments /* ... */ ─────────────────────────────────────────────
    if (ch === '/' && src[i + 1] === '*') {
      i += 2
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { i += 2; break }
        out.push(src[i] === '\n' ? '\n' : ' ')
        i++
      }
      continue
    }

    // ── Line comments // ... ─────────────────────────────────────────────────
    if (ch === '/' && src[i + 1] === '/') {
      i += 2
      while (i < n && src[i] !== '\n') i++
      // the newline itself is consumed in the main loop's next iteration
      continue
    }

    out.push(ch)
    i++
  }

  return out.join('')
}

// ── Self-check for the comment stripper ──────────────────────────────────────
//
// These checks run unconditionally to prove the stripper works correctly.

{
  // Line comment: "// TVL" should vanish
  const stripped1 = stripComments('const x = 1 // TVL\nconst y = 2')
  assert.ok(
    !stripped1.includes('TVL'),
    `Self-check FAILED: "// TVL" should be stripped; got: ${stripped1}`,
  )

  // JSX text: "<p>TVL</p>" should survive
  const stripped2 = stripComments('<p>TVL</p>')
  assert.ok(
    stripped2.includes('TVL'),
    `Self-check FAILED: "<p>TVL</p>" should survive stripping; got: ${stripped2}`,
  )

  // Block comment: "/* TVL */" should vanish
  const stripped3 = stripComments('before /* TVL */ after')
  assert.ok(
    !stripped3.includes('TVL'),
    `Self-check FAILED: "/* TVL */" should be stripped; got: ${stripped3}`,
  )

  // JSX block comment: "{/* TVL */}" should vanish
  const stripped4 = stripComments('before {/* TVL */} after')
  assert.ok(
    !stripped4.includes('TVL'),
    `Self-check FAILED: "{/* TVL */}" should be stripped; got: ${stripped4}`,
  )

  // String literal: 'TVL' inside a string should survive
  const stripped5 = stripComments("const label = 'TVL'")
  assert.ok(
    stripped5.includes('TVL'),
    `Self-check FAILED: "'TVL'" inside string literal should survive; got: ${stripped5}`,
  )

  // Lowercase identifiers in code must survive (whole-word TVL check is for the scanner)
  const stripped6 = stripComments('const tvl = calcTvl()')
  assert.ok(
    stripped6.includes('tvl'),
    `Self-check FAILED: lowercase "tvl" identifier should survive stripping; got: ${stripped6}`,
  )
}

// ── Forbidden phrase definitions ─────────────────────────────────────────────

interface ForbiddenPhrase {
  /** Human-readable label used in violation messages. */
  label: string
  /** Test a single line (already lower-cased where appropriate). */
  test: (line: string) => boolean
}

/**
 * Whole-word match for an exact string (no regex meta-chars needed here).
 * Word boundary: the character before and after must not be [A-Za-z0-9_].
 */
function wholeWord(text: string, word: string): boolean {
  const idx = text.indexOf(word)
  if (idx === -1) return false
  // Check every occurrence
  let pos = idx
  while (pos !== -1) {
    const before = pos === 0 ? ' ' : text[pos - 1]
    const after  = pos + word.length >= text.length ? ' ' : text[pos + word.length]
    const wordChar = /[A-Za-z0-9_]/
    if (!wordChar.test(before) && !wordChar.test(after)) return true
    pos = text.indexOf(word, pos + 1)
  }
  return false
}

const FORBIDDEN: ForbiddenPhrase[] = [
  {
    // Case-SENSITIVE, whole-word: "TVL" must not appear as a standalone token.
    // Lowercase identifiers such as `tvl` or `calcTvl` are NOT flagged.
    label: 'TVL (case-sensitive, whole word)',
    test: (line: string) => wholeWord(line, 'TVL'),
  },
  {
    label: 'value locked',
    test: (line: string) => line.toLowerCase().includes('value locked'),
  },
  {
    label: 'airdrop',
    test: (line: string) => line.toLowerCase().includes('airdrop'),
  },
  {
    label: 'eligible',
    test: (line: string) => line.toLowerCase().includes('eligible'),
  },
  {
    label: 'eligibility',
    test: (line: string) => line.toLowerCase().includes('eligibility'),
  },
]

// ── File collection ───────────────────────────────────────────────────────────

const root = process.cwd()

/** Recursively collect all .tsx files under a directory. */
function collectTsx(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTsx(full))
    } else if (entry.isFile() && extname(entry.name) === '.tsx') {
      results.push(full)
    }
  }
  return results
}

interface ScannedFile {
  path: string
  /** Raw content (for non-.tsx) or comment-stripped content (for .tsx). */
  content: string
  /** Whether this file had comments stripped before scanning. */
  stripped: boolean
}

const filesToScan: ScannedFile[] = []

// All .tsx files under src/
const tsxFiles = collectTsx(join(root, 'src'))
for (const f of tsxFiles) {
  const raw = readFileSync(f, 'utf8')
  filesToScan.push({ path: f, content: stripComments(raw), stripped: true })
}

// public/llms.txt
const llmsPath = join(root, 'public', 'llms.txt')
if (existsSync(llmsPath)) {
  filesToScan.push({
    path: llmsPath,
    content: readFileSync(llmsPath, 'utf8'),
    stripped: false,
  })
}

// index.html (repo root)
const indexPath = join(root, 'index.html')
if (existsSync(indexPath)) {
  filesToScan.push({
    path: indexPath,
    content: readFileSync(indexPath, 'utf8'),
    stripped: false,
  })
}

console.log(`forbiddenWording: scanned ${filesToScan.length} files`)

// ── File-count guard ──────────────────────────────────────────────────────────

assert.ok(
  filesToScan.length >= 40,
  `Expected at least 40 files to be scanned, but only found ${filesToScan.length}. ` +
  `Check that process.cwd() points to the repo root and that src/ contains .tsx files. ` +
  `cwd=${root}`,
)

// ── Scan for violations ───────────────────────────────────────────────────────

interface Violation {
  file: string
  line: number
  phrase: string
  text: string
}

const violations: Violation[] = []

for (const { path: filePath, content } of filesToScan) {
  const lines = content.split('\n')
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    for (const phrase of FORBIDDEN) {
      if (phrase.test(line)) {
        violations.push({
          file: filePath.startsWith(root) ? filePath.slice(root.length + 1) : filePath,
          line: lineIdx + 1,
          phrase: phrase.label,
          text: line.trim().slice(0, 120),
        })
      }
    }
  }
}

// ── Single assertion: all violations at once ──────────────────────────────────

assert.deepEqual(
  violations,
  [],
  `Forbidden wording found in ${violations.length} location(s):\n` +
  violations
    .map((v) => `  ${v.file}:${v.line}  [${v.phrase}]  ${v.text}`)
    .join('\n'),
)

console.log('forbiddenWording: OK — no forbidden phrases found')
