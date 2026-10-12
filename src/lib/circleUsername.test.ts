/**
 * Unit tests for src/lib/circleUsername.ts
 * Run: node --experimental-strip-types --no-warnings src/lib/circleUsername.test.ts
 */
import assert from 'node:assert/strict'
import { toCircleUsername } from './circleUsername.ts'

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0
let total = 0

function test(name: string, fn: () => void) {
  total++
  try {
    fn()
    console.log(`  ✓  ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗  ${name}`)
    console.error(`     ${(err as Error).message}`)
  }
}

// ─── basic identity / pass-through ───────────────────────────────────────────

console.log('\ntoCircleUsername — pass-through / normalization')

test("'alice_arc' (9 chars, all allowed) → 'alice_arc'", () => {
  assert.equal(toCircleUsername('alice_arc'), 'alice_arc')
})

test("' alice arc ' → 'alice_arc' (trim + spaces become underscore)", () => {
  // ' alice arc ' → trim → 'alice arc' → replace /\s+/g,'_' → 'alice_arc' (9 chars)
  assert.equal(toCircleUsername(' alice arc '), 'alice_arc')
})

test("tab between chars becomes underscore: 'a\\tbc' → 'pulsarc-a_bc'", () => {
  // 'a\tbc' → trim → 'a\tbc' → replace /\s+/g,'_' → 'a_bc' (4 chars) < 5 → 'pulsarc-a_bc'
  assert.equal(toCircleUsername('a\tbc'), 'pulsarc-a_bc')
})

test("multiple spaces collapse to single underscore: 'ab  cde' → 'ab_cde'", () => {
  // 'ab  cde' → trim → 'ab  cde' → replace /\s+/g,'_' → 'ab_cde' (6 chars)
  assert.equal(toCircleUsername('ab  cde'), 'ab_cde')
})

// ─── character stripping ─────────────────────────────────────────────────────

console.log('\ntoCircleUsername — character stripping')

test("disallowed chars stripped: 'al!ce$name' → 'alcename' (8 chars)", () => {
  // '!' and '$' are not in [A-Za-z0-9_@.:+-] → removed
  assert.equal(toCircleUsername('al!ce$name'), 'alcename')
})

test("allowed punctuation _ @ . : + - is preserved: 'a_@.:+-bc' → 'a_@.:+-bc'", () => {
  assert.equal(toCircleUsername('a_@.:+-bc'), 'a_@.:+-bc')
})

test("unicode letters outside ASCII are stripped: 'şeker12' → 'eker12'", () => {
  // ş (U+015F) is not in [A-Za-z0-9_@.:+-]; e,k,e,r,1,2 are all allowed
  // 'şeker12' → strip → 'eker12' (6 chars) → no prefix needed
  assert.equal(toCircleUsername('şeker12'), 'eker12')
})

test("all-disallowed chars ('!!!!') strip to empty → random suffix", () => {
  const result = toCircleUsername('!!!!')
  assert.match(result, /^pulsarc-[a-z0-9]{1,4}$/)
})

// ─── length boundaries ────────────────────────────────────────────────────────

console.log('\ntoCircleUsername — length boundaries')

test("'abcd' (4 chars) → 'pulsarc-abcd' (prefixed because 4 < 5)", () => {
  assert.equal(toCircleUsername('abcd'), 'pulsarc-abcd')
})

test("'abcde' (exactly 5 chars) → 'abcde' (no prefix, boundary)", () => {
  // length === 5 is NOT < 5, so no prefix
  assert.equal(toCircleUsername('abcde'), 'abcde')
})

test("'abc' (3 chars) → 'pulsarc-abc'", () => {
  assert.equal(toCircleUsername('abc'), 'pulsarc-abc')
})

test('60-char name → sliced to exactly 50 chars', () => {
  const long = 'a'.repeat(60)
  const result = toCircleUsername(long)
  assert.equal(result.length, 50)
  assert.equal(result, 'a'.repeat(50))
})

test('50-char name → kept as-is (no slice, no prefix)', () => {
  const exact = 'b'.repeat(50)
  const result = toCircleUsername(exact)
  assert.equal(result.length, 50)
  assert.equal(result, exact)
})

test('51-char name → sliced to 50', () => {
  const over = 'c'.repeat(51)
  assert.equal(toCircleUsername(over).length, 50)
})

// ─── empty / undefined input ──────────────────────────────────────────────────

console.log('\ntoCircleUsername — empty / undefined')

test('empty string → pulsarc- + random base36 chars, matches /^pulsarc-[a-z0-9]{1,4}$/', () => {
  const result = toCircleUsername('')
  assert.match(result, /^pulsarc-[a-z0-9]{1,4}$/)
})

test('undefined → pulsarc- + random base36 chars, matches /^pulsarc-[a-z0-9]{1,4}$/', () => {
  const result = toCircleUsername(undefined)
  assert.match(result, /^pulsarc-[a-z0-9]{1,4}$/)
})

// ─── Math.random stub for deterministic empty-input test ──────────────────────

console.log('\ntoCircleUsername — Math.random stub')

test('stub Math.random = () => 0.5 → suffix equals (0.5).toString(36).slice(2,6)', () => {
  // (0.5).toString(36) === '0.i'  →  .slice(2, 6) === 'i'
  // empty input: u = '' → u || Math.random().toString(36).slice(2,6) = 'i' → 'pulsarc-i'
  const expectedSuffix = (0.5).toString(36).slice(2, 6)  // 'i'
  const expected = `pulsarc-${expectedSuffix}`            // 'pulsarc-i'

  const original = Math.random
  try {
    Math.random = () => 0.5
    assert.equal(toCircleUsername(''), expected)
  } finally {
    Math.random = original
  }
})

test('Math.random is restored after stub (sanity)', () => {
  const v = Math.random()
  assert.ok(v >= 0 && v < 1, `Math.random() returned ${v}, not in [0,1)`)
})

// ─── whitespace-only input ───────────────────────────────────────────────────

console.log('\ntoCircleUsername — whitespace-only')

test("whitespace-only ('   ') → trim → '' → random suffix", () => {
  // '   ' → trim → '' → replace /\s+/ → '' → strip → '' → random branch
  const result = toCircleUsername('   ')
  assert.match(result, /^pulsarc-[a-z0-9]{1,4}$/)
})

test("newline-only ('\\n\\n') → random suffix", () => {
  const result = toCircleUsername('\n\n')
  assert.match(result, /^pulsarc-[a-z0-9]{1,4}$/)
})

// ─── prefix + slice interaction ───────────────────────────────────────────────

console.log('\ntoCircleUsername — prefix + slice interaction')

test("'ab' (2 chars) → 'pulsarc-ab' (10 chars, well under 50)", () => {
  assert.equal(toCircleUsername('ab'), 'pulsarc-ab')
})

test("'z' (1 char) → 'pulsarc-z' (9 chars)", () => {
  assert.equal(toCircleUsername('z'), 'pulsarc-z')
})

// ─── digits / special chars ──────────────────────────────────────────────────

console.log('\ntoCircleUsername — digits / special chars')

test("5 digits '12345' → kept as-is (no prefix)", () => {
  assert.equal(toCircleUsername('12345'), '12345')
})

test("4 digits '1234' → 'pulsarc-1234'", () => {
  assert.equal(toCircleUsername('1234'), 'pulsarc-1234')
})

test("allowed special chars only, length 5: '_@.:+' → '_@.:+'", () => {
  // '_', '@', '.', ':', '+' are all in [A-Za-z0-9_@.:+-], length 5 → no prefix
  assert.equal(toCircleUsername('_@.:+'), '_@.:+')
})

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed}/${total} assertions passed`)
if (passed < total) process.exit(1)
