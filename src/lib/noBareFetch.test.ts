/**
 * noBareFetch.test.ts
 *
 * Drift test: every .ts/.tsx file under src/hooks/, src/pages/, and src/lib/
 * (excluding *.test.* files and the two files that own their own timeouts) must
 * use fetchWithTimeout rather than the global fetch().
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/noBareFetch.test.ts
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Repo root ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
// src/lib/noBareFetch.test.ts  →  repo root is two levels up
const REPO_ROOT = join(__filename, '..', '..', '..')

// ── Files that own their own timeouts (excluded from scanning) ────────────────

const EXCLUDED_FILES = new Set([
  join(REPO_ROOT, 'src', 'lib', 'fetchWithTimeout.ts'),
  join(REPO_ROOT, 'src', 'lib', 'arcscan.ts'),
  join(REPO_ROOT, 'src', 'lib', 'arcscanCore.ts'),
])

// ── Allow-list ────────────────────────────────────────────────────────────────
//
// Each entry: { file: string (relative to repo root), line_contains: string }
// A violation matching both file and line_contains is suppressed.
// An entry that matches NOTHING is itself a failure (stale allowlist).
//
// src/lib/dataSnippets.ts: `await fetch(` appears inside template strings shown
// to users as copy-paste code snippets — not a real network call from this app.

const ALLOWED: { file: string; line_contains: string }[] = [
  { file: 'src/lib/dataSnippets.ts',    line_contains: 'await fetch(' },
]

// ── Regex to strip // line comments ──────────────────────────────────────────
//
// Removes everything from // to end of line (not inside strings — we keep
// strings per spec and only strip comments).

function stripLineComments(src: string): string {
  // Remove // … to end-of-line.  We use a simple per-line approach.
  return src
    .split('\n')
    .map((line) => {
      // Find the first // that is not inside a string.
      // Simple heuristic: scan char by char tracking string state.
      let inSingle = false
      let inDouble = false
      let inTemplate = false
      for (let i = 0; i < line.length - 1; i++) {
        const c = line[i]
        const prev = i > 0 ? line[i - 1] : ''
        if (c === "'" && !inDouble && !inTemplate && prev !== '\\') inSingle = !inSingle
        if (c === '"' && !inSingle && !inTemplate && prev !== '\\') inDouble = !inDouble
        if (c === '`' && !inSingle && !inDouble && prev !== '\\') inTemplate = !inTemplate
        if (!inSingle && !inDouble && !inTemplate && c === '/' && line[i + 1] === '/') {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

// ── Regex to strip /* */ block comments ──────────────────────────────────────

function stripBlockComments(src: string): string {
  // Replace /* ... */ (including multiline) with spaces (preserve line numbers).
  return src.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    // Preserve newlines so line numbers stay correct.
    return match.replace(/[^\n]/g, ' ')
  })
}

function stripComments(src: string): string {
  return stripLineComments(stripBlockComments(src))
}

// ── Bare-fetch detector ───────────────────────────────────────────────────────
//
// Flags `fetch(` that is NOT preceded by an identifier character [A-Za-z0-9_$]
// or a dot, so:
//   await fetch(    → flagged
//   fetch(          → flagged (at line start or after whitespace/operators)
//   fetchWithTimeout( → NOT flagged  (identifier char before `fetch(`)
//   q.refetch(      → NOT flagged  (dot before `fetch(`)
//   prefetch(       → NOT flagged  (identifier char before `fetch(`)
//   refetch(        → NOT flagged  (identifier char before `fetch(`)

const BARE_FETCH_RE = /(?<![A-Za-z0-9_$.])\bfetch\(/g

interface Violation {
  location: string  // "src/hooks/foo.ts:12"
  line: string      // trimmed, max 120 chars
}

// ── Collect files ─────────────────────────────────────────────────────────────

function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectFiles(full))
    } else if (stat.isFile()) {
      const ext = extname(entry)
      if ((ext === '.ts' || ext === '.tsx') && !basename(entry).includes('.test.')) {
        if (!EXCLUDED_FILES.has(full)) {
          results.push(full)
        }
      }
    }
  }
  return results
}

const SCAN_DIRS = [
  join(REPO_ROOT, 'src', 'hooks'),
  join(REPO_ROOT, 'src', 'pages'),
  join(REPO_ROOT, 'src', 'lib'),
]

const allFiles = SCAN_DIRS.flatMap(collectFiles)

// ── Scan for violations ───────────────────────────────────────────────────────

// Track which allow-list entries are actually matched (to catch stale entries).
const allowedMatched = new Set<number>()

const violations: Violation[] = []

for (const absPath of allFiles) {
  const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/')
  const raw = readFileSync(absPath, 'utf8')
  const stripped = stripComments(raw)
  const lines = stripped.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]
    BARE_FETCH_RE.lastIndex = 0
    if (BARE_FETCH_RE.test(lineText)) {
      const lineNum = i + 1
      const trimmed = lineText.trim().slice(0, 120)

      // Check allow-list
      let allowed = false
      for (let ai = 0; ai < ALLOWED.length; ai++) {
        const entry = ALLOWED[ai]
        if (
          relPath === entry.file &&
          lineText.includes(entry.line_contains)
        ) {
          allowedMatched.add(ai)
          allowed = true
          break
        }
      }

      if (!allowed) {
        violations.push({
          location: `${relPath}:${lineNum}`,
          line: trimmed,
        })
      }
    }
  }
}

// ── Stale allow-list check ────────────────────────────────────────────────────

const staleEntries: string[] = []
for (let i = 0; i < ALLOWED.length; i++) {
  if (!allowedMatched.has(i)) {
    staleEntries.push(`${ALLOWED[i].file} line_contains=${JSON.stringify(ALLOWED[i].line_contains)}`)
  }
}

// ── In-file self-checks ───────────────────────────────────────────────────────

// These strings are checked against the bare-fetch regex directly (after
// stripping comments) to verify the detector works as expected.

function testDetector(src: string): boolean {
  const stripped = stripComments(src)
  const lines = stripped.split('\n')
  for (const line of lines) {
    BARE_FETCH_RE.lastIndex = 0
    if (BARE_FETCH_RE.test(line)) return true
  }
  return false
}

// `await fetch(u)` must be flagged
assert.equal(testDetector('const r = await fetch(u)'), true,
  'self-check: await fetch(u) should be flagged')

// `q.refetch()` must NOT be flagged
assert.equal(testDetector('q.refetch()'), false,
  'self-check: q.refetch() should not be flagged')

// `await fetchWithTimeout(u)` must NOT be flagged
assert.equal(testDetector('const r = await fetchWithTimeout(u)'), false,
  'self-check: fetchWithTimeout should not be flagged')

// `// fetch(x)` in a line comment must NOT be flagged
assert.equal(testDetector('// fetch(x)'), false,
  'self-check: comment-only fetch( should not be flagged')

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`Scanned ${allFiles.length} file(s) across src/hooks/, src/pages/, src/lib/`)

assert.ok(
  allFiles.length >= 40,
  `Expected at least 40 files to be scanned, got ${allFiles.length}. ` +
  `Dirs checked: ${SCAN_DIRS.join(', ')}`,
)

assert.deepEqual(
  staleEntries,
  [],
  `Stale allow-list entries (matched nothing):\n${staleEntries.join('\n')}`,
)

assert.deepEqual(
  violations,
  [],
  `Bare fetch() calls found (use fetchWithTimeout instead):\n` +
  violations.map((v) => `  ${v.location}: ${v.line}`).join('\n'),
)

console.log('noBareFetch: all checks passed.')
