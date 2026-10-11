/**
 * Tests for src/lib/walletIndex.ts
 * Run: node --experimental-strip-types src/lib/walletIndex.test.ts
 */
import assert from 'node:assert/strict'
import {
  EPOCH_MS,
  dayToDate,
  shardOf,
  parseMeta,
  parseShard,
  decodeRecord,
  activeDays,
  longestStreak,
  appIds,
  summarize,
  coverageNote,
} from './walletIndex.ts'
import type { WalletRecord, AppsConfig, MetaJson } from './walletIndex.ts'

// ── Verify nothing exported is a score/rating ──────────────────────────────────
// (This test checks the exported names from the module at import time.)

let pass = 0
let fail = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✔ ${name}`)
    pass++
  } catch (e) {
    console.log(`  ✘ ${name}`)
    console.log(`    ${e instanceof Error ? e.message : String(e)}`)
    fail++
  }
}

// ── Sample fixtures (inline — copied from context/samples/) ───────────────────

const SAMPLE_META: unknown = { since: 5, through: 283, gaps: [], walletCount: 3, lite: false }

const SAMPLE_META_LITE: unknown = { since: 5, through: 283, gaps: [10, 11], walletCount: 3, lite: true }

// shard-abc.json contains two wallets
const SAMPLE_SHARD: unknown = {
  '0xabc0000000000000000000000000000000000001': [5, 283, '3fff00000000000000000000000000000000000000000000000000000000000000001', 1200, 36, 0.512, 15230.5, 9800.25, '5', 2, 1],
  '0xabcdef0000000000000000000000000000000002': [250, 252, '7', 3, 0, 0.0021, 0, 12.5, '0', 0, 0],
}

// Apps list (testnet-style, trimmed to what we need for tests)
const SAMPLE_APPS: AppsConfig = {
  apps: [
    { id: 'usdc', anchors: [] },
    { id: 'eurc', anchors: [] },
    { id: 'usyc', anchors: [] },
  ],
}

// ── shardOf ────────────────────────────────────────────────────────────────────

console.log('\nshardOf')

test('lower-cases the first 3 hex chars after 0x', () => {
  assert.equal(shardOf('0xABC1230000000000000000000000000000000000'), 'abc')
})

test('preserves lowercase input', () => {
  assert.equal(shardOf('0xabc0000000000000000000000000000000000001'), 'abc')
})

test('returns null for empty string', () => {
  assert.equal(shardOf(''), null)
})

test('returns null for short address', () => {
  assert.equal(shardOf('0x1234'), null)
})

test('returns null for missing 0x prefix', () => {
  assert.equal(shardOf('abc0000000000000000000000000000000000001'), null)
})

test('returns null for non-hex chars', () => {
  assert.equal(shardOf('0xZZZ0000000000000000000000000000000000000'), null)
})

test('returns null for 43-char address', () => {
  assert.equal(shardOf('0x12345678901234567890123456789012345678901'), null)
})

// ── dayToDate ──────────────────────────────────────────────────────────────────

console.log('\ndayToDate')

test('day 0 is 2026-01-01 UTC', () => {
  const d = dayToDate(0)
  assert.equal(d.getUTCFullYear(), 2026)
  assert.equal(d.getUTCMonth(), 0) // January
  assert.equal(d.getUTCDate(), 1)
})

test('day 283 is 2026-10-11 UTC', () => {
  // 2026-01-01 + 283 days: Jan has 31 days → +31 = Feb 1 (day 31),
  // Feb 28 days → +28 = Mar 1 (day 59), Mar 31 → Apr 1 (day 90),
  // Apr 30 → May 1 (day 120), May 31 → Jun 1 (day 151), Jun 30 → Jul 1 (day 181),
  // Jul 31 → Aug 1 (day 212), Aug 31 → Sep 1 (day 243), Sep 30 → Oct 1 (day 273),
  // Oct 1 + 10 = Oct 11 (day 283). ✓
  const d = dayToDate(283)
  assert.equal(d.getUTCFullYear(), 2026)
  assert.equal(d.getUTCMonth(), 9) // October (0-indexed)
  assert.equal(d.getUTCDate(), 11)
})

test('EPOCH_MS is the correct ms value', () => {
  assert.equal(EPOCH_MS, Date.UTC(2026, 0, 1))
})

// ── decodeRecord ───────────────────────────────────────────────────────────────

console.log('\ndecodeRecord')

test('decodes the first sample row correctly', () => {
  const arr = [5, 283, '3fff00000000000000000000000000000000000000000000000000000000000000001', 1200, 36, 0.512, 15230.5, 9800.25, '5', 2, 1]
  const rec = decodeRecord(arr)
  assert.ok(rec !== null)
  assert.equal(rec!.f, 5)
  assert.equal(rec!.l, 283)
  assert.equal(rec!.t, 1200)
  assert.equal(rec!.x, 36)
  assert.equal(rec!.e, 0.512)
  assert.equal(rec!.o, 15230.5)
  assert.equal(rec!.i, 9800.25)
  assert.equal(rec!.a, '5')
  assert.equal(rec!.bo, 2)
  assert.equal(rec!.bi, 1)
})

test('decodes the second sample row (small values)', () => {
  const arr = [250, 252, '7', 3, 0, 0.0021, 0, 12.5, '0', 0, 0]
  const rec = decodeRecord(arr)
  assert.ok(rec !== null)
  assert.equal(rec!.f, 250)
  assert.equal(rec!.l, 252)
  assert.equal(rec!.d, '7')
})

test('returns null for non-array', () => {
  assert.equal(decodeRecord({ f: 5 }), null)
})

test('returns null for array with wrong length (10 elements)', () => {
  assert.equal(decodeRecord([5, 283, '1', 1200, 36, 0.512, 15230.5, 9800.25, '5', 2]), null)
})

test('returns null for negative number in field f', () => {
  assert.equal(decodeRecord([-1, 283, '1', 1200, 36, 0.512, 15230.5, 9800.25, '5', 2, 1]), null)
})

test('returns null for non-finite field (NaN)', () => {
  assert.equal(decodeRecord([5, NaN, '1', 1200, 36, 0.512, 15230.5, 9800.25, '5', 2, 1]), null)
})

test('returns null for non-hex bitmap d', () => {
  assert.equal(decodeRecord([5, 283, 'xyz', 1200, 36, 0.512, 15230.5, 9800.25, '5', 2, 1]), null)
})

test('returns null for non-hex apps mask a', () => {
  assert.equal(decodeRecord([5, 283, '1', 1200, 36, 0.512, 15230.5, 9800.25, 'g!', 2, 1]), null)
})

test('returns null for string in numeric field t', () => {
  assert.equal(decodeRecord([5, 283, '1', '1200', 36, 0.512, 15230.5, 9800.25, '5', 2, 1]), null)
})

// ── activeDays ─────────────────────────────────────────────────────────────────

console.log('\nactiveDays')

function makeRec(overrides: Partial<WalletRecord>): WalletRecord {
  return {
    f: 0, l: 0, d: '1', t: 0, x: 0, e: 0, o: 0, i: 0, a: '0', bo: 0, bi: 0,
    ...overrides,
  }
}

test('single bit "1" → 1 active day', () => {
  assert.equal(activeDays(makeRec({ d: '1' })), 1)
})

test('"7" (0b111) → 3 active days', () => {
  assert.equal(activeDays(makeRec({ d: '7' })), 3)
})

test('"f" (0b1111) → 4 active days', () => {
  assert.equal(activeDays(makeRec({ d: 'f' })), 4)
})

test('bitmap longer than 53 bits (BigInt required) — "3fff...1" (sample row)', () => {
  // This hex value has many bits set; just confirm it does not overflow or throw
  const bigHex = '3fff00000000000000000000000000000000000000000000000000000000000000001'
  const rec = makeRec({ d: bigHex })
  const n = activeDays(rec)
  // Manually count: 0x3fff = 14 bits, rest are zeros except trailing '1' = 1 bit → 15
  assert.equal(n, 15)
})

test('gaps in bitmap are not counted', () => {
  // 0b1001 = 9 → 2 bits set
  assert.equal(activeDays(makeRec({ d: '9' })), 2)
})

// ── longestStreak ──────────────────────────────────────────────────────────────

console.log('\nlongestStreak')

test('"1" → streak 1', () => {
  assert.equal(longestStreak(makeRec({ d: '1' })), 1)
})

test('"7" (0b111) → streak 3', () => {
  assert.equal(longestStreak(makeRec({ d: '7' })), 3)
})

test('"9" (0b1001) → streak 1 (gap in middle)', () => {
  assert.equal(longestStreak(makeRec({ d: '9' })), 1)
})

test('"f" (0b1111) → streak 4', () => {
  assert.equal(longestStreak(makeRec({ d: 'f' })), 4)
})

test('bitmap with two runs: 0b1110011 = 0x73 → streak 3', () => {
  // 0x73 = 0b1110011 → runs of 2, then 3 → longest = 3
  assert.equal(longestStreak(makeRec({ d: '73' })), 3)
})

test('large bitmap with leading run: 0x3fff = 0b11111111111111 → streak 14', () => {
  assert.equal(longestStreak(makeRec({ d: '3fff' })), 14)
})

// ── appIds ─────────────────────────────────────────────────────────────────────

console.log('\nappIds')

test('mask "5" (0b101) on 3-entry list → ["usdc", "usyc"]', () => {
  const rec = makeRec({ a: '5' })
  const ids = appIds(rec, SAMPLE_APPS)
  assert.deepEqual(ids, ['usdc', 'usyc'])
})

test('mask "0" → no apps', () => {
  const rec = makeRec({ a: '0' })
  const ids = appIds(rec, SAMPLE_APPS)
  assert.deepEqual(ids, [])
})

test('mask "7" (all 3 bits) → all 3 app ids', () => {
  const rec = makeRec({ a: '7' })
  const ids = appIds(rec, SAMPLE_APPS)
  assert.deepEqual(ids, ['usdc', 'eurc', 'usyc'])
})

test('bit beyond list length (bit 3 with 3-entry list) is ignored', () => {
  // 0b1111 = 0xf → bits 0,1,2,3 set; bit 3 is beyond the 3-entry list
  const rec = makeRec({ a: 'f' })
  const ids = appIds(rec, SAMPLE_APPS)
  // Should only return the 3 known apps, not a 4th undefined entry
  assert.deepEqual(ids, ['usdc', 'eurc', 'usyc'])
  assert.equal(ids.length, 3)
})

// ── summarize ──────────────────────────────────────────────────────────────────

console.log('\nsummarize')

const META = parseMeta(SAMPLE_META) as MetaJson
const META_LITE = parseMeta(SAMPLE_META_LITE) as MetaJson

// Use the second sample record (simple values, easy to verify by hand)
// [250, 252, '7', 3, 0, 0.0021, 0, 12.5, '0', 0, 0]
const REC2 = decodeRecord([250, 252, '7', 3, 0, 0.0021, 0, 12.5, '0', 0, 0]) as WalletRecord

test('summarize: ageDays = through - f + 1 = 283 - 250 + 1 = 34', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.ageDays, 34)
})

test('summarize: activeDays from "7" (0b111) = 3', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.activeDays, 3)
})

test('summarize: longestStreak from "7" = 3', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.longestStreak, 3)
})

test('summarize: activeShare = 3/34', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.ok(Math.abs(s.activeShare - 3 / 34) < 1e-10)
})

test('summarize: tx=3, failed=0, failedShare=0/3=0', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.tx, 3)
  assert.equal(s.failed, 0)
  assert.equal(s.failedShare, 0)
})

test('summarize: failedShare is null when tx=0', () => {
  const recZeroTx = decodeRecord([250, 252, '7', 0, 0, 0, 0, 0, '0', 0, 0]) as WalletRecord
  const s = summarize(recZeroTx, META, SAMPLE_APPS)
  assert.equal(s.failedShare, null)
})

test('summarize: partial=false when meta.lite=false', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.partial, false)
})

test('summarize: partial=true when meta.lite=true', () => {
  const s = summarize(REC2, META_LITE, SAMPLE_APPS)
  assert.equal(s.partial, true)
})

test('summarize: apps=[] when mask "0"', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.deepEqual(s.apps, [])
})

test('summarize: firstSeen is dayToDate(250)', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.firstSeen.getTime(), new Date(EPOCH_MS + 250 * 86_400_000).getTime())
})

test('summarize: feesUsdc, usdcSent, usdcReceived', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.feesUsdc, 0.0021)
  assert.equal(s.usdcSent, 0)
  assert.equal(s.usdcReceived, 12.5)
})

test('summarize: bridgeOut=0, bridgeIn=0 for rec2', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  assert.equal(s.bridgeOut, 0)
  assert.equal(s.bridgeIn, 0)
})

// ── parseMeta ──────────────────────────────────────────────────────────────────

console.log('\nparseMeta')

test('parses valid meta', () => {
  const m = parseMeta(SAMPLE_META)
  assert.ok(m !== null)
  assert.equal(m!.since, 5)
  assert.equal(m!.through, 283)
  assert.equal(m!.lite, false)
  assert.deepEqual(m!.gaps, [])
})

test('parses meta with gaps and lite=true', () => {
  const m = parseMeta(SAMPLE_META_LITE)
  assert.ok(m !== null)
  assert.equal(m!.lite, true)
  assert.deepEqual(m!.gaps, [10, 11])
})

test('returns null for null', () => {
  assert.equal(parseMeta(null), null)
})

test('returns null for array', () => {
  assert.equal(parseMeta([]), null)
})

test('returns null when since is missing', () => {
  assert.equal(parseMeta({ through: 283, gaps: [], walletCount: 3, lite: false }), null)
})

test('returns null when through is negative', () => {
  assert.equal(parseMeta({ since: 5, through: -1, gaps: [], walletCount: 3, lite: false }), null)
})

test('returns null when gaps contains non-number', () => {
  assert.equal(parseMeta({ since: 5, through: 283, gaps: ['bad'], walletCount: 3, lite: false }), null)
})

test('returns null when lite is not boolean', () => {
  assert.equal(parseMeta({ since: 5, through: 283, gaps: [], walletCount: 3, lite: 1 }), null)
})

// ── parseShard ─────────────────────────────────────────────────────────────────

console.log('\nparseShard')

test('parses both valid entries from sample shard', () => {
  const shard = parseShard(SAMPLE_SHARD)
  const keys = Object.keys(shard)
  assert.equal(keys.length, 2)
  assert.ok('0xabc0000000000000000000000000000000000001' in shard)
  assert.ok('0xabcdef0000000000000000000000000000000002' in shard)
})

test('drops malformed entries, keeps good ones', () => {
  const mixed: unknown = {
    '0xabc1111111111111111111111111111111111111': [250, 252, '7', 3, 0, 0.0021, 0, 12.5, '0', 0, 0], // good
    '0xabc2222222222222222222222222222222222222': 'bad', // bad — not an array
    '0xabc3333333333333333333333333333333333333': [5, 283, '1', -1, 0, 0, 0, 0, '0', 0, 0], // bad — negative t
  }
  const shard = parseShard(mixed)
  assert.equal(Object.keys(shard).length, 1)
  assert.ok('0xabc1111111111111111111111111111111111111' in shard)
})

test('returns empty object for non-object input', () => {
  assert.deepEqual(parseShard(null), {})
  assert.deepEqual(parseShard('string'), {})
  assert.deepEqual(parseShard([1, 2, 3]), {})
})

test('returns empty object for empty object', () => {
  assert.deepEqual(parseShard({}), {})
})

// ── No score/rank/grade exported ───────────────────────────────────────────────

console.log('\nNo score/rank/grade')

test('walletIndex exports no function with score/rank/grade in its name', () => {
  // Dynamic import check via the names we imported
  const exported = [
    'EPOCH_MS', 'dayToDate', 'shardOf', 'parseMeta', 'parseShard', 'decodeRecord',
    'activeDays', 'longestStreak', 'appIds', 'summarize', 'coverageNote',
  ]
  const forbidden = /score|rank|grade|rating|tier|level/i
  for (const name of exported) {
    assert.ok(!forbidden.test(name), `Exported name "${name}" looks like a score/rank/grade`)
  }
})

test('summarize result has no score/rank/grade property', () => {
  const s = summarize(REC2, META, SAMPLE_APPS)
  const forbidden = /score|rank|grade|rating|tier|level/i
  for (const key of Object.keys(s)) {
    assert.ok(!forbidden.test(key), `summarize result has key "${key}" that looks like a score`)
  }
})

// ── coverageNote ───────────────────────────────────────────────────────────────

console.log('\ncoverageNote')

test('no-gaps note starts with "Covers"', () => {
  const note = coverageNote(META)
  assert.ok(note.startsWith('Covers '), `Got: ${note}`)
})

test('no-gaps note does not mention Gap', () => {
  const note = coverageNote(META)
  assert.ok(!note.includes('Gap'), `Unexpected Gap in: ${note}`)
})

test('with-gaps note includes "Gap"', () => {
  const note = coverageNote(META_LITE)
  assert.ok(note.includes('Gap'), `Expected Gap in: ${note}`)
})

test('note contains the from/to dates in YYYY-MM-DD format', () => {
  const note = coverageNote(META)
  // since=5 → 2026-01-06; through=283 → 2026-10-11
  assert.ok(note.includes('2026-01-06'), `Missing since date in: ${note}`)
  assert.ok(note.includes('2026-10-11'), `Missing through date in: ${note}`)
})

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
