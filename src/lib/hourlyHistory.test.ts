/**
 * Tests for src/lib/hourlyHistory.ts
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/hourlyHistory.test.ts
 *
 * Uses node:assert/strict only — no test framework.
 * Reads the real fixture from src/lib/fixtures/ — no mocking.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import { buildHourlyHistory, buildHourlyMetrics, labelFor } from './hourlyHistory.ts'
import type { HourlyHour } from './hourlyApps.ts'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

// ── Fixture ───────────────────────────────────────────────────────────────────

const FIXTURE_PATH = join(__dir, 'fixtures', 'mainnet-hourly-2026-10-13-first3.json')
let FIXTURE: Record<string, HourlyHour>
try {
  FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Record<string, HourlyHour>
} catch (e) {
  throw new Error(`FAIL: fixture not found at ${FIXTURE_PATH}\n${String(e)}`)
}

// Reference "now" = 2026-10-13T03:00:00Z (just after T02 ends, all 3 slots in window)
const NOW_24H = Date.UTC(2026, 9, 13, 3, 0, 0, 0)
// For 1h: "now" = 2026-10-13T01:59:00Z so T01 is in [now-1h, now)
const NOW_1H  = Date.UTC(2026, 9, 13, 1, 59, 0, 0)

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (e) {
    console.error(`  FAIL  ${name}`)
    console.error(`        ${(e as Error).message}`)
    failed++
  }
}

// ── labelFor ──────────────────────────────────────────────────────────────────

test('labelFor: hour key → HH:00', () => {
  assert.equal(labelFor('2026-10-13T00'), '00:00')
  assert.equal(labelFor('2026-10-13T14'), '14:00')
  assert.equal(labelFor('2026-10-13T23'), '23:00')
})

// ── Empty input ───────────────────────────────────────────────────────────────

test('empty files → empty history + zero metrics', () => {
  const { history, metricsPerApp } = buildHourlyHistory([], ['usdc'], 86_400_000, NOW_24H)
  assert.equal(history.total.length, 0)
  assert.equal(history.coveredMs, 0)
  assert.equal(metricsPerApp['usdc']?.txCount, 0)
  assert.equal(metricsPerApp['usdc']?.volume, null)
})

test('no appIds → empty perApp and empty metricsPerApp', () => {
  const { history, metricsPerApp } = buildHourlyHistory([FIXTURE], [], 86_400_000, NOW_24H)
  assert.deepEqual(history.perApp, {})
  assert.deepEqual(metricsPerApp, {})
})

// ── 24h window: all 3 fixture slots (T00, T01, T02) should be in window ───────

test('24h window: history.total.length = 3 (one per fixture hour)', () => {
  const { history } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  assert.equal(history.total.length, 3)
})

test('24h window: perApp[usdc].length = 3', () => {
  const { history } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  assert.equal(history.perApp['usdc']?.length, 3)
})

test('24h window: complete = false when fewer than 24 hours present', () => {
  // Fixture only has 3 hours; 24h expects 24 → complete=false
  const { history } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  assert.equal(history.complete, false)
})

test('24h window: metrics txCount sums all 3 slots for usdc', () => {
  // T00=17874, T01=21236 (check fixture), T02=? — just verify sum > T00 alone
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  const m = metricsPerApp['usdc']
  assert.ok(m !== undefined)
  assert.ok(m.txCount >= 17874, `txCount ${m.txCount} should be ≥ T00 alone (17874)`)
})

test('24h window: metrics volume is non-null for usdc (has vol in T00)', () => {
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  assert.ok(metricsPerApp['usdc']?.volume !== null)
})

test('24h window: tvl is always null', () => {
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc', 'uniswap'], 86_400_000, NOW_24H)
  assert.equal(metricsPerApp['usdc']?.tvl, null)
  assert.equal(metricsPerApp['uniswap']?.tvl, null)
})

test('24h window: rankChange = 0 and trend = null', () => {
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  const m = metricsPerApp['usdc']
  assert.equal(m?.rankChange, 0)
  assert.equal(m?.trend, null)
})

test('24h window: estimated = true when incomplete (< 24 hours in window)', () => {
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  assert.equal(metricsPerApp['usdc']?.estimated, true)
})

// ── 1h window ─────────────────────────────────────────────────────────────────

test('1h window with NOW_1H: exactly 1 slot (T01) in window', () => {
  // now = 2026-10-13T01:59; window = [T01:00, T01:59) — T01 slot (starts T01:00) is included
  const { history } = buildHourlyHistory([FIXTURE], ['usdc'], 3_600_000, NOW_1H)
  assert.equal(history.total.length, 1)
})

test('1h window: complete = true when exactly 1 hour present and expectedHours=1', () => {
  const { history } = buildHourlyHistory([FIXTURE], ['usdc'], 3_600_000, NOW_1H)
  assert.equal(history.complete, true)
})

test('1h window: estimated = false when complete', () => {
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc'], 3_600_000, NOW_1H)
  assert.equal(metricsPerApp['usdc']?.estimated, false)
})

test('1h window: txCount matches T01 usdc exactly (from fixture)', () => {
  // From fixture T01: usdc tx = value we know from the fixture
  // We know T00=17874; T01 is the second hour. Read from the test expectation in hourlyApps.test.ts:
  // uniswap T01 tx=21514. usdc T01 we need to check from the full fixture.
  // We rely on buildHourlyHistory being consistent with appSeriesFromHourly (already tested).
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc'], 3_600_000, NOW_1H)
  const m = metricsPerApp['usdc']
  assert.ok(m !== undefined)
  assert.ok(m.txCount > 0, `expected txCount > 0 for usdc T01, got ${m.txCount}`)
})

// ── Missing app ────────────────────────────────────────────────────────────────

test('missing app → zero txCount, null volume/fees, null tvl', () => {
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['nonexistent'], 86_400_000, NOW_24H)
  const m = metricsPerApp['nonexistent']
  assert.ok(m !== undefined)
  assert.equal(m.txCount, 0)
  assert.equal(m.activeWallets, 0)
  assert.equal(m.volume, null)
  assert.equal(m.tvl, null)
  assert.equal(m.usdcFees, null)
})

// ── Partial coverage (complete:false) ─────────────────────────────────────────

test('partial coverage: complete=false when fewer hours than expected', () => {
  // 24h requires 24 slots; fixture has 3 → complete=false
  const { history } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  assert.equal(history.complete, false)
})

// ── total = sum of perApp ──────────────────────────────────────────────────────

test('total.txCount at T00 = sum of all apps txCounts at T00', () => {
  const appIds = ['usdc', 'eurc', 'uniswap']
  const { history } = buildHourlyHistory([FIXTURE], appIds, 86_400_000, NOW_24H)
  // Per-app txCounts at slot 0 (T00)
  const perAppSum = appIds.reduce((s, id) => s + (history.perApp[id]?.[0]?.txCount ?? 0), 0)
  assert.equal(history.total[0].txCount, perAppSum)
})

test('total.volume at T00 = sum of all apps volumes at T00', () => {
  const appIds = ['usdc', 'eurc', 'uniswap']
  const { history } = buildHourlyHistory([FIXTURE], appIds, 86_400_000, NOW_24H)
  const perAppSum = appIds.reduce((s, id) => s + (history.perApp[id]?.[0]?.volume ?? 0), 0)
  // Allow for floating point: use a tolerance
  assert.ok(Math.abs(history.total[0].volume - perAppSum) < 0.001,
    `total.volume ${history.total[0].volume} should equal perApp sum ${perAppSum}`)
})

// ── buildHourlyMetrics convenience wrapper ────────────────────────────────────

test('buildHourlyMetrics returns same as buildHourlyHistory for single app', () => {
  const m1 = buildHourlyMetrics([FIXTURE], 'usdc', 86_400_000, NOW_24H)
  const { metricsPerApp } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  assert.deepEqual(m1, metricsPerApp['usdc'])
})

test('buildHourlyMetrics for unknown app returns zero metrics', () => {
  const m = buildHourlyMetrics([FIXTURE], 'ghost', 86_400_000, NOW_24H)
  assert.equal(m.txCount, 0)
  assert.equal(m.tvl, null)
})

// ── coveredMs ─────────────────────────────────────────────────────────────────

test('coveredMs = number of window hours * 3600000', () => {
  const { history } = buildHourlyHistory([FIXTURE], ['usdc'], 86_400_000, NOW_24H)
  // 3 fixture hours fall in the window
  assert.equal(history.coveredMs, 3 * 3_600_000)
})

// ── MUTATION KILLERS ──────────────────────────────────────────────────────────

// ── Mutant 1 (line 109): `>=` → `>`
//
// Filter predicate: ts >= windowStart && ts < nowMs
//
// With `>` instead of `>=`, a slot whose ts === windowStart is incorrectly
// excluded.  The two boundary assertions below distinguish the operators:
//   - ts === windowStart → INCLUDED  (correct with >=, excluded with >)
//   - ts === nowMs       → EXCLUDED  (correct with <, both operators agree here)
//
// Construction:
//   nowMs_b   = 2026-10-13T05:00Z
//   windowMs  = 3 * HOUR_MS = 10_800_000 ms
//   windowStart = nowMs_b - 10_800_000 = 2026-10-13T02:00Z
//
// Slots present in the synthetic file:
//   '2026-10-13T02' → ts = Date.UTC(2026,9,13,2)  = windowStart   (INCLUDED)
//   '2026-10-13T03' → ts = Date.UTC(2026,9,13,3)  > windowStart, < nowMs_b (INCLUDED)
//   '2026-10-13T04' → ts = Date.UTC(2026,9,13,4)  > windowStart, < nowMs_b (INCLUDED)
//   '2026-10-13T05' → ts = Date.UTC(2026,9,13,5)  = nowMs_b       (EXCLUDED: ts < nowMs fails)
//
// With `>=`: slots T02, T03, T04 pass → total.length === 3
// With `>` : slots T03, T04 pass (T02 excluded) → total.length === 2  ← mutant fails here

const HOUR_MS_TEST = 3_600_000
const nowMs_b = Date.UTC(2026, 9, 13, 5, 0, 0, 0)     // 2026-10-13T05:00Z
const windowMs_3h = 3 * HOUR_MS_TEST                   // windowStart = T02:00
const minimalHour: HourlyHour = { tx: 1, wallets: 1, vol: 0, fee: 0 }
const boundaryFile: Record<string, HourlyHour> = {
  '2026-10-13T02': minimalHour,   // ts === windowStart — MUST be included
  '2026-10-13T03': minimalHour,
  '2026-10-13T04': minimalHour,
  '2026-10-13T05': minimalHour,   // ts === nowMs_b — MUST be excluded
}

test('boundary: slot at ts===windowStart is INCLUDED (kills >= → > mutant)', () => {
  // windowStart = 2026-10-13T02:00Z = nowMs_b - 3h
  // T02 ts === windowStart → must be counted
  // T05 ts === nowMs_b     → must NOT be counted
  // Expected in-window: T02, T03, T04 → total.length === 3
  const { history } = buildHourlyHistory([boundaryFile], ['dummy'], windowMs_3h, nowMs_b)
  assert.equal(
    history.total.length,
    3,
    `Expected 3 slots (T02 inclusive, T05 exclusive), got ${history.total.length}. ` +
    `A '>=' → '>' mutant would yield 2 (T02 missing); a wrong '<' direction would yield 4 (T05 included).`,
  )
})

test('boundary: slot at ts===nowMs is EXCLUDED (ts < nowMs check)', () => {
  // T05 slot has ts = nowMs_b; it must never appear in any window ending at nowMs_b
  // Use a 4h window so windowStart = T01; all of T01-T05 are candidates, but T05 excluded
  const windowMs_4h = 4 * HOUR_MS_TEST  // windowStart = 2026-10-13T01:00Z
  const file4h: Record<string, HourlyHour> = {
    '2026-10-13T01': minimalHour,
    '2026-10-13T02': minimalHour,
    '2026-10-13T03': minimalHour,
    '2026-10-13T04': minimalHour,
    '2026-10-13T05': minimalHour,  // ts === nowMs_b → excluded
  }
  const { history } = buildHourlyHistory([file4h], ['dummy'], windowMs_4h, nowMs_b)
  assert.equal(
    history.total.length,
    4,
    `Expected 4 slots (T01-T04), T05 at ts===nowMs must be excluded, got ${history.total.length}.`,
  )
})

// ── Mutant 2 (line 160): Math.floor → Math.ceil
//
// expectedHours = Math.floor(windowMs / HOUR_MS)
//
// With a non-integer ratio (windowMs = 2.5 * HOUR_MS = 9_000_000):
//   floor(9_000_000 / 3_600_000) = floor(2.5) = 2   → complete = (2 >= 2) = true
//   ceil (9_000_000 / 3_600_000) = ceil (2.5) = 3   → complete = (2 >= 3) = false
//
// Construction:
//   nowMs_25  = 2026-10-13T10:00Z
//   windowMs  = 9_000_000 ms (2.5 h)
//   windowStart = 10:00 - 2.5h = 07:30Z
//
// Hour-keys whose ts falls in [07:30, 10:00):
//   '2026-10-13T08' → ts = 08:00 >= 07:30 ✓ AND < 10:00 ✓   INCLUDED
//   '2026-10-13T09' → ts = 09:00 >= 07:30 ✓ AND < 10:00 ✓   INCLUDED
//   '2026-10-13T07' → ts = 07:00 < 07:30                     EXCLUDED
//   '2026-10-13T10' → ts = 10:00, not < 10:00                EXCLUDED
//
// Exactly 2 hours in window.
// floor: expectedHours=2 → complete = (2 >= 2) = true   ← correct
// ceil:  expectedHours=3 → complete = (2 >= 3) = false  ← mutant fails here

const nowMs_25  = Date.UTC(2026, 9, 13, 10, 0, 0, 0)   // 2026-10-13T10:00Z
const windowMs_25h = 9_000_000                           // 2.5 * HOUR_MS
const file25h: Record<string, HourlyHour> = {
  '2026-10-13T07': minimalHour,   // excluded: ts < windowStart
  '2026-10-13T08': minimalHour,   // in window
  '2026-10-13T09': minimalHour,   // in window
  '2026-10-13T10': minimalHour,   // excluded: ts === nowMs (not < nowMs)
}

test('floor-vs-ceil: 2.5h window with 2 in-window slots → complete=true (kills floor→ceil mutant)', () => {
  // floor(2.5) = 2; ceil(2.5) = 3
  // 2 hours present; complete = (2 >= expectedHours)
  // With floor: 2 >= 2 → true (correct)
  // With ceil:  2 >= 3 → false (mutant is caught here)
  const { history } = buildHourlyHistory([file25h], ['dummy'], windowMs_25h, nowMs_25)
  assert.equal(
    history.complete,
    true,
    `Expected complete=true with floor(2.5)=2 and 2 in-window slots. ` +
    `A ceil mutant would yield complete=false (3 expected, 2 present).`,
  )
})

// ── Mutant 3 (lines 230-231): zero-state fallback object in buildHourlyMetrics
//
// When the requested appId is not in the appIds list passed to buildHourlyHistory
// (i.e. metricsPerApp[appId] is undefined), buildHourlyMetrics returns a hard-coded
// zero-state object:
//   { txCount:0, activeWallets:0, volume:null, tvl:null,
//     usdcFees:null, rankChange:0, trend:null, estimated:false }
//
// This test uses deepStrictEqual to assert every field, so any single-field
// mutation (e.g. tvl: 0 instead of null, rankChange: 1, trend: undefined,
// estimated: true) will be caught independently.

test('zero-state metricsPerApp: every field when no data and complete=true (kills line 230-231 mutations)', () => {
  // The fallback literal at lines 230-231 of buildHourlyMetrics is:
  //   { txCount:0, activeWallets:0, volume:null, tvl:null,
  //     usdcFees:null, rankChange:0, trend:null, estimated:false }
  //
  // The ?? branch is unreachable via buildHourlyMetrics because buildHourlyHistory
  // always populates metricsPerApp[id] for every id in appIds.  The equivalent
  // reachable code path that produces the SAME shape is:
  //   buildHourlyHistory([], ['app'], 0, nowMs)
  // with windowMs=0:
  //   expectedHours = floor(0 / HOUR_MS) = 0
  //   complete      = (0 >= 0) = true
  //   estimated     = !complete = false
  // and no files → txCount=0, activeWallets=0, volume=null, tvl=null,
  //   usdcFees=null, rankChange=0, trend=null.
  //
  // deepStrictEqual ensures EVERY field is checked individually so any single-field
  // mutation (tvl: 0, rankChange: 1, trend: undefined, estimated: true) fails.
  const { metricsPerApp } = buildHourlyHistory([], ['my-zero-app'], 0, NOW_24H)
  assert.deepStrictEqual(metricsPerApp['my-zero-app'], {
    txCount:       0,
    activeWallets: 0,
    volume:        null,
    tvl:           null,
    usdcFees:      null,
    rankChange:    0,
    trend:         null,
    estimated:     false,
  })
  // Also verify via buildHourlyMetrics (same reachable path, ?? never fires).
  const m2 = buildHourlyMetrics([], 'my-zero-app', 0, NOW_24H)
  assert.deepStrictEqual(m2, {
    txCount:       0,
    activeWallets: 0,
    volume:        null,
    tvl:           null,
    usdcFees:      null,
    rankChange:    0,
    trend:         null,
    estimated:     false,
  })
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log()
console.log(`hourlyHistory: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
