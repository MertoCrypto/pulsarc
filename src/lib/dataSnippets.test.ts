/**
 * Tests for dataSnippets.ts
 * Run with:
 *   node --experimental-strip-types src/lib/dataSnippets.test.ts
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { quickStartSnippets } from './dataSnippets.ts'
import { DATA_BASE } from './dataCatalog.ts'

const LATEST_URL = `${DATA_BASE}/mainnet/latest.json`

// ── exact expected strings ─────────────────────────────────────────────────────

const EXPECTED_CURL =
  `curl -s "${LATEST_URL}"`

const EXPECTED_JS = [
  `const res = await fetch("${LATEST_URL}");`,
  `if (!res.ok) throw new Error("HTTP " + res.status);`,
  `const data = await res.json();`,
  `console.log(data.generatedAt);`,
].join('\n')

const EXPECTED_PYTHON = [
  `import json, urllib.request`,
  `with urllib.request.urlopen("${LATEST_URL}") as r:`,
  `    data = json.load(r)`,
  `print(data.get("generatedAt"))`,
].join('\n')

// ── helpers ────────────────────────────────────────────────────────────────────

function writeTmpMjs(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-test-'))
  const file = join(dir, 'snippet.mjs')
  // Wrap in an async IIFE so top-level await is valid in a module
  writeFileSync(file, `(async () => {\n${body}\n})();`)
  return file
}

function checkMjs(body: string): void {
  const file = writeTmpMjs(body)
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  } finally {
    rmSync(file)
  }
}

// ── tests ──────────────────────────────────────────────────────────────────────

const snippets = quickStartSnippets(LATEST_URL)

// 1. Returns exactly three entries in the right order
assert.equal(snippets.length, 3, 'should return 3 snippets')
assert.equal(snippets[0].id, 'curl')
assert.equal(snippets[1].id, 'javascript')
assert.equal(snippets[2].id, 'python')

// 2. Exact curl string
assert.equal(snippets[0].code, EXPECTED_CURL, 'curl snippet must match exactly')

// 3. Exact JavaScript string
assert.equal(snippets[1].code, EXPECTED_JS, 'javascript snippet must match exactly')

// 4. Exact Python string
assert.equal(snippets[2].code, EXPECTED_PYTHON, 'python snippet must match exactly')

// 5. JS snippet parses as a valid async module body (node --check)
checkMjs(snippets[1].code)
console.log('  JS snippet passes node --check')

// 6. URL outside DATA_BASE throws
assert.throws(
  () => quickStartSnippets('https://evil.example.com/data.json'),
  /must start with DATA_BASE/,
  'should throw for URL outside DATA_BASE',
)

// 7. URL with double quote does not break the JS snippet (node --check)
{
  const weirdUrl = `${DATA_BASE}/mainnet/weird"quoted.json`
  let weirdSnippets: ReturnType<typeof quickStartSnippets>
  try {
    weirdSnippets = quickStartSnippets(weirdUrl)
  } catch {
    // If it throws for a non-DATA_BASE reason that's unexpected — re-throw.
    // But the URL does start with DATA_BASE so it should succeed.
    throw new Error('quickStartSnippets threw unexpectedly for a DATA_BASE URL with a double quote')
  }
  checkMjs(weirdSnippets[1].code)
  console.log('  JS snippet with double-quote URL passes node --check')
}

// 8. URL with backslash does not break the JS snippet (node --check)
{
  const backslashUrl = `${DATA_BASE}/mainnet/weird\\path.json`
  const bsSnippets = quickStartSnippets(backslashUrl)
  checkMjs(bsSnippets[1].code)
  console.log('  JS snippet with backslash URL passes node --check')
}

// 9. URL with a backslash is escaped in the Python string (hand-written expectation)
{
  const py = quickStartSnippets(`${DATA_BASE}/c\\x`)[2].code
  assert.ok(
    py.includes('urlopen("' + DATA_BASE + '/c\\\\x")'),
    'python snippet must escape the backslash as \\\\',
  )
  console.log('  Python snippet escapes a backslash in the URL')
}

console.log('\nAll tests passed.')
