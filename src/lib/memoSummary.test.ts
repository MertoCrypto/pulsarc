/**
 * Unit tests for src/lib/memoSummary.ts
 *
 * Run from the repo root:
 *   node --experimental-strip-types --no-warnings src/lib/memoSummary.test.ts
 *
 * Uses only node:assert (no test framework).
 */

import assert from 'node:assert/strict'
import { decodeMemo, summarizeMemos } from './memoSummary.ts'
import type { MemoEntry } from './memoSummary.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

function makeEntry(
  overrides: Partial<MemoEntry> & { id: number },
): MemoEntry {
  const { id, ...rest } = overrides
  return {
    block: id,
    tx: `0xtx${id}`,
    sender: `0xsender${id}`,
    target: `0xtarget${id}`,
    memoId: `memo${id}`,
    text: null,
    ...rest,
  }
}

// ---------------------------------------------------------------------------
// decodeMemo
// ---------------------------------------------------------------------------

console.log('\ndecodeMemo')

test("'0x68656c6c6f' decodes to 'hello'", () => {
  assert.equal(decodeMemo('0x68656c6c6f'), 'hello')
})

test("'0x' (empty) returns null", () => {
  assert.equal(decodeMemo('0x'), null)
})

test('printable text with space, accents and emoji round-trips', () => {
  const text = 'Héllo wörld 🎉'
  const hex = `0x${Buffer.from(text).toString('hex')}` as `0x${string}`
  assert.equal(decodeMemo(hex), text)
})

// Boundary tests: the rejected range is [\u0000-\u0008\u000e-\u001f].
// U+0009 (tab), U+000A (LF), U+000B, U+000C, U+000D (CR) fall in the
// gap between \u0008 and \u000e and are therefore ACCEPTED.

test('text containing a tab (0x09) is accepted', () => {
  // "a\tb" → 0x61 0x09 0x62
  const result = decodeMemo('0x610962')
  assert.equal(result, 'a\tb')
})

test('text containing a newline (0x0a) is accepted', () => {
  // "a\nb" → 0x61 0x0a 0x62
  const result = decodeMemo('0x610a62')
  assert.equal(result, 'a\nb')
})

test('text containing a carriage return (0x0d) is accepted', () => {
  // "a\rb" → 0x61 0x0d 0x62
  const result = decodeMemo('0x610d62')
  assert.equal(result, 'a\rb')
})

// Exact boundary: 0x08 rejected, 0x09 accepted
test('0x08 (U+0008, in rejected range) returns null', () => {
  assert.equal(decodeMemo('0x08'), null)
})

test('0x09 (U+0009 tab, first accepted control char) returns the tab character', () => {
  assert.equal(decodeMemo('0x09'), '\t')
})

// Exact boundary: 0x0d accepted, 0x0e rejected
test('0x0d (U+000D CR, accepted) returns CR character', () => {
  assert.equal(decodeMemo('0x0d'), '\r')
})

test('0x0e (U+000E, in rejected range) returns null', () => {
  assert.equal(decodeMemo('0x0e'), null)
})

// Exact boundary: 0x1f rejected, 0x20 accepted
test('0x1f (U+001F, in rejected range) returns null', () => {
  assert.equal(decodeMemo('0x1f'), null)
})

test('0x20 (U+0020 space, first fully-accepted printable) returns space', () => {
  assert.equal(decodeMemo('0x20'), ' ')
})

test('NUL byte (0x00) anywhere rejects the whole memo', () => {
  // "h\u0000e" — 0x68 0x00 0x65
  assert.equal(decodeMemo('0x680065'), null)
})

// Invalid UTF-8 bytes (0xff 0xfe): viem's hexToString decodes them as two
// U+FFFD replacement characters (confirmed by running the real function).
// U+FFFD is NOT in the rejected control-char range, so decodeMemo returns
// the two-replacement-char string rather than null.
test('bytes that are not valid UTF-8 (0xfffe): returns string with U+FFFD replacement chars, NOT null', () => {
  const result = decodeMemo('0xfffe')
  // Pinned from actual run: two U+FFFD replacement characters
  const expected = '\uFFFD\uFFFD'
  assert.equal(result, expected)
})

test('non-hex string does not throw and returns null', () => {
  // 'not-hex' throws inside hexToString; the catch block returns null.
  // Cast required because the type says Hex but we are testing the guard.
  assert.equal(decodeMemo('not-hex' as `0x${string}`), null)
})

// ---------------------------------------------------------------------------
// summarizeMemos
// ---------------------------------------------------------------------------

console.log('\nsummarizeMemos')

test('empty list returns zeros, empty arrays, and passes hours through', () => {
  const result = summarizeMemos([], 24)
  assert.equal(result.total, 0)
  assert.equal(result.uniqueSenders, 0)
  assert.equal(result.uniqueTargets, 0)
  assert.equal(result.uniqueMemoIds, 0)
  assert.deepEqual(result.entries, [])
  assert.deepEqual(result.topPairs, [])
  assert.equal(result.hours, 24)
})

test('hours value is passed through unchanged', () => {
  assert.equal(summarizeMemos([], 7).hours, 7)
  assert.equal(summarizeMemos([], 0).hours, 0)
})

test('counts total, uniqueSenders, uniqueTargets, uniqueMemoIds exactly', () => {
  // 4 entries: sender A appears twice, target X appears twice, memoId "m1" twice
  const entries: MemoEntry[] = [
    makeEntry({ id: 1, sender: '0xA', target: '0xX', memoId: 'm1' }),
    makeEntry({ id: 2, sender: '0xA', target: '0xY', memoId: 'm1' }), // same sender, same memoId
    makeEntry({ id: 3, sender: '0xB', target: '0xX', memoId: 'm2' }), // same target
    makeEntry({ id: 4, sender: '0xC', target: '0xZ', memoId: 'm3' }),
  ]
  const result = summarizeMemos(entries, 1)
  assert.equal(result.total, 4)
  assert.equal(result.uniqueSenders, 3)   // A, B, C
  assert.equal(result.uniqueTargets, 3)   // X, Y, Z
  assert.equal(result.uniqueMemoIds, 3)   // m1, m2, m3
})

test('entries is the first 25 of the input in input order (30-entry list)', () => {
  const entries: MemoEntry[] = Array.from({ length: 30 }, (_, i) =>
    makeEntry({ id: i + 1, memoId: `m${i + 1}` }),
  )
  const result = summarizeMemos(entries, 1)
  assert.equal(result.entries.length, 25)
  assert.equal(result.entries[0].memoId, 'm1')
  assert.equal(result.entries[24].memoId, 'm25')
  // total reflects the full 30
  assert.equal(result.total, 30)
})

test('exactly 25 entries stays 25', () => {
  const entries: MemoEntry[] = Array.from({ length: 25 }, (_, i) =>
    makeEntry({ id: i + 1 }),
  )
  const result = summarizeMemos(entries, 1)
  assert.equal(result.entries.length, 25)
  assert.equal(result.total, 25)
})

test('26 entries: entries is limited to 25, total is 26', () => {
  const entries: MemoEntry[] = Array.from({ length: 26 }, (_, i) =>
    makeEntry({ id: i + 1 }),
  )
  const result = summarizeMemos(entries, 1)
  assert.equal(result.entries.length, 25)
  assert.equal(result.total, 26)
})

test('topPairs groups by sender>target, A>B and B>A counted separately', () => {
  const entries: MemoEntry[] = [
    // pair A->B: 3 times
    makeEntry({ id: 1, sender: '0xA', target: '0xB' }),
    makeEntry({ id: 2, sender: '0xA', target: '0xB' }),
    makeEntry({ id: 3, sender: '0xA', target: '0xB' }),
    // pair B->A: 2 times (reversed — separate pair)
    makeEntry({ id: 4, sender: '0xB', target: '0xA' }),
    makeEntry({ id: 5, sender: '0xB', target: '0xA' }),
    // pair C->D: 1 time
    makeEntry({ id: 6, sender: '0xC', target: '0xD' }),
  ]
  const result = summarizeMemos(entries, 1)

  // A->B and B->A are distinct pairs
  const ab = result.topPairs.find(p => p.sender === '0xA' && p.target === '0xB')
  const ba = result.topPairs.find(p => p.sender === '0xB' && p.target === '0xA')
  assert.ok(ab, 'pair A->B should be present')
  assert.ok(ba, 'pair B->A should be present')
  assert.equal(ab!.count, 3)
  assert.equal(ba!.count, 2)
})

test('topPairs is sorted by count descending and limited to 5 (7 distinct pairs)', () => {
  // Build 7 distinct sender->target pairs with counts 7,6,5,4,3,2,1
  const entries: MemoEntry[] = []
  const pairs = [
    { sender: '0xS7', target: '0xT7', n: 7 },
    { sender: '0xS6', target: '0xT6', n: 6 },
    { sender: '0xS5', target: '0xT5', n: 5 },
    { sender: '0xS4', target: '0xT4', n: 4 },
    { sender: '0xS3', target: '0xT3', n: 3 },
    { sender: '0xS2', target: '0xT2', n: 2 },
    { sender: '0xS1', target: '0xT1', n: 1 },
  ]
  let idCounter = 0
  for (const { sender, target, n } of pairs) {
    for (let i = 0; i < n; i++) {
      entries.push(makeEntry({ id: ++idCounter, sender, target }))
    }
  }
  const result = summarizeMemos(entries, 1)

  assert.equal(result.topPairs.length, 5)
  // Sorted descending: 7, 6, 5, 4, 3
  assert.equal(result.topPairs[0].count, 7)
  assert.equal(result.topPairs[0].sender, '0xS7')
  assert.equal(result.topPairs[1].count, 6)
  assert.equal(result.topPairs[2].count, 5)
  assert.equal(result.topPairs[3].count, 4)
  assert.equal(result.topPairs[4].count, 3)
  // The bottom two pairs (counts 2, 1) are excluded
  const excluded2 = result.topPairs.find(p => p.sender === '0xS2')
  const excluded1 = result.topPairs.find(p => p.sender === '0xS1')
  assert.equal(excluded2, undefined)
  assert.equal(excluded1, undefined)
})

test('ties between equal counts keep first-seen order (stable sort)', () => {
  // Three pairs each with count 2; first-seen order: P->Q, R->S, U->V.
  // After stable sort they must appear in that same order.
  const entries: MemoEntry[] = [
    makeEntry({ id: 1, sender: '0xP', target: '0xQ' }),
    makeEntry({ id: 2, sender: '0xP', target: '0xQ' }),
    makeEntry({ id: 3, sender: '0xR', target: '0xS' }),
    makeEntry({ id: 4, sender: '0xR', target: '0xS' }),
    makeEntry({ id: 5, sender: '0xU', target: '0xV' }),
    makeEntry({ id: 6, sender: '0xU', target: '0xV' }),
  ]
  const result = summarizeMemos(entries, 1)
  assert.equal(result.topPairs.length, 3)
  // All counts equal 2
  assert.equal(result.topPairs[0].count, 2)
  assert.equal(result.topPairs[1].count, 2)
  assert.equal(result.topPairs[2].count, 2)
  // First-seen order preserved by stable sort
  assert.equal(result.topPairs[0].sender, '0xP')
  assert.equal(result.topPairs[1].sender, '0xR')
  assert.equal(result.topPairs[2].sender, '0xU')
})

test('input array is not mutated by summarizeMemos', () => {
  const entries: MemoEntry[] = Array.from({ length: 5 }, (_, i) =>
    makeEntry({ id: i + 1 }),
  )
  const original = entries.map(e => ({ ...e }))
  summarizeMemos(entries, 1)
  assert.equal(entries.length, original.length)
  for (let i = 0; i < entries.length; i++) {
    assert.deepEqual(entries[i], original[i])
  }
})

test('unique senders and targets are counted separately (3 senders, 2 targets)', () => {
  const r = summarizeMemos([
    makeEntry({ id: 1, sender: '0xA', target: '0xX', memoId: 'm1' }),
    makeEntry({ id: 2, sender: '0xB', target: '0xX', memoId: 'm2' }),
    makeEntry({ id: 3, sender: '0xC', target: '0xY', memoId: 'm3' }),
  ], 24)
  assert.equal(r.uniqueSenders, 3)
  assert.equal(r.uniqueTargets, 2)
})

test('the same sender with two different targets forms two separate pairs', () => {
  const r = summarizeMemos([
    makeEntry({ id: 1, sender: '0xA', target: '0xX' }),
    makeEntry({ id: 2, sender: '0xA', target: '0xY' }),
    makeEntry({ id: 3, sender: '0xA', target: '0xY' }),
  ], 24)
  assert.deepEqual(r.topPairs.map(p => [p.sender, p.target, p.count]), [['0xA', '0xY', 2], ['0xA', '0xX', 1]])
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} assertions run: ${passed} passed, ${failed} failed.`)
if (failed > 0) {
  process.exitCode = 1
}
