/**
 * Tests for src/lib/hourlyApps.ts
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/hourlyApps.test.ts
 *
 * Uses node:assert/strict only — no test framework.
 * Reads the real fixture from src/lib/fixtures/ — no mocking, no skipping.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import { appSeriesFromHourly, hourlyToHistoryPoints, buildHistoryFromHourly } from './hourlyApps.ts'
import type { HourlyHour } from './hourlyApps.ts'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

// ── Load real fixture ─────────────────────────────────────────────────────────

const FIXTURE_PATH = join(__dir, 'fixtures', 'mainnet-hourly-2026-10-13-first3.json')
let FIXTURE: Record<string, HourlyHour>
try {
  FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Record<string, HourlyHour>
} catch (e) {
  throw new Error(`FAIL: fixture not found at ${FIXTURE_PATH} — copy it before running tests.\n${String(e)}`)
}

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

// ── Empty input ───────────────────────────────────────────────────────────────

test('empty object input → empty series', () => {
  const result = appSeriesFromHourly({}, ['usdc', 'eurc'])
  assert.deepEqual(result, { usdc: [], eurc: [] })
})

test('empty array input → empty series', () => {
  const result = appSeriesFromHourly([], ['usdc'])
  assert.deepEqual(result, { usdc: [] })
})

test('no appIds → empty record', () => {
  const result = appSeriesFromHourly(FIXTURE, [])
  assert.deepEqual(result, {})
})

// ── Missing app ───────────────────────────────────────────────────────────────

test('app absent from all buckets → all-zero points for each hour', () => {
  const result = appSeriesFromHourly(FIXTURE, ['nonexistent-app'])
  const pts = result['nonexistent-app']
  assert.ok(pts.length > 0, 'should have one point per hour in the fixture')
  for (const pt of pts) {
    assert.equal(pt.tx, 0)
    assert.equal(pt.wallets, 0)
    assert.equal(pt.vol, 0)
    assert.equal(pt.fee, 0)
  }
})

test('app absent from ONE bucket → that slot is zero, others normal', () => {
  // 'multicall' is absent from '2026-10-13T00' but present in T01 and T02.
  const result = appSeriesFromHourly(FIXTURE, ['multicall'])
  const pts = result['multicall']
  assert.ok(pts.length === 3, `expected 3 points, got ${pts.length}`)

  const t00 = pts.find(p => p.hour === '2026-10-13T00')
  assert.ok(t00, 'should have a T00 point')
  assert.equal(t00.tx, 0)
  assert.equal(t00.wallets, 0)

  const t01 = pts.find(p => p.hour === '2026-10-13T01')
  assert.ok(t01, 'should have a T01 point')
  assert.ok(t01.tx > 0, 'T01 multicall should have tx > 0')
})

// ── Real fixture values ───────────────────────────────────────────────────────

test('usdc T00 values match fixture exactly', () => {
  const result = appSeriesFromHourly(FIXTURE, ['usdc'])
  const pts = result['usdc']
  const t00 = pts.find(p => p.hour === '2026-10-13T00')
  assert.ok(t00, 'T00 point must exist')
  assert.equal(t00.tx, 17874)
  assert.equal(t00.wallets, 3383)
  assert.equal(t00.vol, 12940419.8741)
  assert.equal(t00.fee, 0)
})

test('uniswap T01 values match fixture exactly', () => {
  const result = appSeriesFromHourly(FIXTURE, ['uniswap'])
  const pts = result['uniswap']
  const t01 = pts.find(p => p.hour === '2026-10-13T01')
  assert.ok(t01, 'T01 point must exist')
  assert.equal(t01.tx, 21514)
  assert.equal(t01.wallets, 2489)
  assert.equal(t01.vol, 0)
  assert.equal(t01.fee, 70.788653)
})

test('fixture produces 3 points per app (T00, T01, T02)', () => {
  const result = appSeriesFromHourly(FIXTURE, ['usdc', 'eurc', 'uniswap'])
  for (const [appId, pts] of Object.entries(result)) {
    assert.equal(pts.length, 3, `${appId} should have 3 points`)
    assert.equal(pts[0].hour, '2026-10-13T00')
    assert.equal(pts[1].hour, '2026-10-13T01')
    assert.equal(pts[2].hour, '2026-10-13T02')
  }
})

test('points are sorted oldest → newest', () => {
  const result = appSeriesFromHourly(FIXTURE, ['usdc'])
  const pts = result['usdc']
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].hour > pts[i - 1].hour, 'hours should be ascending')
  }
})

// ── Corrupt row skipping ──────────────────────────────────────────────────────

test('corrupt row (all-null app entry) is skipped', () => {
  const badFile: Record<string, HourlyHour> = {
    '2026-01-01T00': { apps: { myapp: null as unknown as never } },
    '2026-01-01T01': { apps: { myapp: { tx: 5, wallets: 2, vol: 100, fee: 0.1 } } },
  }
  const result = appSeriesFromHourly(badFile, ['myapp'])
  const pts = result['myapp']
  // T00 app entry is null (corrupt) → skip; T01 is valid → included
  assert.equal(pts.length, 1, `expected 1 point after skipping corrupt row, got ${pts.length}`)
  assert.equal(pts[0].hour, '2026-01-01T01')
  assert.equal(pts[0].tx, 5)
})

test('corrupt bucket (non-object) is skipped entirely', () => {
  const badFile: Record<string, HourlyHour> = {
    '2026-01-01T00': 'not-an-object' as unknown as HourlyHour,
    '2026-01-01T01': { apps: { myapp: { tx: 3, wallets: 1, vol: 0, fee: 0 } } },
  }
  const result = appSeriesFromHourly(badFile, ['myapp'])
  // T00 bucket is invalid → skipped (no zero-fill either)
  assert.equal(result['myapp'].length, 1)
  assert.equal(result['myapp'][0].hour, '2026-01-01T01')
})

test('invalid hour key is skipped', () => {
  const badFile: Record<string, HourlyHour> = {
    'not-a-key': { apps: { myapp: { tx: 9, wallets: 3, vol: 0, fee: 0 } } },
    '2026-01-01T05': { apps: { myapp: { tx: 7, wallets: 2, vol: 0, fee: 0 } } },
  }
  const result = appSeriesFromHourly(badFile, ['myapp'])
  assert.equal(result['myapp'].length, 1)
  assert.equal(result['myapp'][0].hour, '2026-01-01T05')
})

// ── Duplicate hour: last file wins, no double-counting ────────────────────────

test('duplicate hour across two files: second file wins', () => {
  const file1: Record<string, HourlyHour> = {
    '2026-01-01T00': { apps: { myapp: { tx: 10, wallets: 5, vol: 100, fee: 1 } } },
  }
  const file2: Record<string, HourlyHour> = {
    '2026-01-01T00': { apps: { myapp: { tx: 20, wallets: 8, vol: 200, fee: 2 } } },
  }
  const result = appSeriesFromHourly([file1, file2], ['myapp'])
  assert.equal(result['myapp'].length, 1)
  const pt = result['myapp'][0]
  // second file wins: tx=20 not 10+20=30
  assert.equal(pt.tx, 20)
  assert.equal(pt.wallets, 8)
  assert.equal(pt.vol, 200)
  assert.equal(pt.fee, 2)
})

test('wallets are NOT summed across hours (per-slot value, not running total)', () => {
  const file: Record<string, HourlyHour> = {
    '2026-01-01T00': { apps: { myapp: { tx: 1, wallets: 5, vol: 0, fee: 0 } } },
    '2026-01-01T01': { apps: { myapp: { tx: 1, wallets: 3, vol: 0, fee: 0 } } },
  }
  const result = appSeriesFromHourly(file, ['myapp'])
  // wallets should be 5 then 3, NOT 5+3=8
  assert.equal(result['myapp'][0].wallets, 5)
  assert.equal(result['myapp'][1].wallets, 3)
})

// ── Multiple day files ────────────────────────────────────────────────────────

test('two day files with different hours are merged and sorted', () => {
  const day1: Record<string, HourlyHour> = {
    '2026-01-01T22': { apps: { myapp: { tx: 1, wallets: 1, vol: 0, fee: 0 } } },
    '2026-01-01T23': { apps: { myapp: { tx: 2, wallets: 1, vol: 0, fee: 0 } } },
  }
  const day2: Record<string, HourlyHour> = {
    '2026-01-02T00': { apps: { myapp: { tx: 3, wallets: 1, vol: 0, fee: 0 } } },
    '2026-01-02T01': { apps: { myapp: { tx: 4, wallets: 1, vol: 0, fee: 0 } } },
  }
  const result = appSeriesFromHourly([day1, day2], ['myapp'])
  const pts = result['myapp']
  assert.equal(pts.length, 4)
  assert.equal(pts[0].hour, '2026-01-01T22')
  assert.equal(pts[3].hour, '2026-01-02T01')
  assert.equal(pts[0].tx, 1)
  assert.equal(pts[3].tx, 4)
})

test('out-of-order keys in single file are sorted correctly', () => {
  const file: Record<string, HourlyHour> = {
    '2026-01-01T03': { apps: { a: { tx: 3, wallets: 1, vol: 0, fee: 0 } } },
    '2026-01-01T01': { apps: { a: { tx: 1, wallets: 1, vol: 0, fee: 0 } } },
    '2026-01-01T02': { apps: { a: { tx: 2, wallets: 1, vol: 0, fee: 0 } } },
  }
  const pts = appSeriesFromHourly(file, ['a'])['a']
  assert.equal(pts[0].tx, 1)
  assert.equal(pts[1].tx, 2)
  assert.equal(pts[2].tx, 3)
})

// ── hourlyToHistoryPoints ─────────────────────────────────────────────────────

test('hourlyToHistoryPoints maps fields correctly', () => {
  const pts = appSeriesFromHourly(FIXTURE, ['usdc'])['usdc']
  const hpts = hourlyToHistoryPoints(pts)
  assert.equal(hpts.length, 3)
  // label should be 'HH:00'
  assert.equal(hpts[0].label, '00:00')
  assert.equal(hpts[1].label, '01:00')
  assert.equal(hpts[2].label, '02:00')
  // numeric fields
  assert.equal(hpts[0].txCount, 17874)
  assert.equal(hpts[0].activeWallets, 3383)
  assert.equal(hpts[0].volume, 12940419.8741)
  assert.equal(hpts[0].usdcFees, 0)
})

// ── buildHistoryFromHourly ────────────────────────────────────────────────────

test('buildHistoryFromHourly: perApp keys match appIds', () => {
  const series = appSeriesFromHourly(FIXTURE, ['usdc', 'eurc'])
  const history = buildHistoryFromHourly(series, true)
  assert.ok('usdc' in history.perApp)
  assert.ok('eurc' in history.perApp)
  assert.equal(Object.keys(history.perApp).length, 2)
})

test('buildHistoryFromHourly: total.length === number of distinct hours', () => {
  const series = appSeriesFromHourly(FIXTURE, ['usdc', 'eurc', 'uniswap'])
  const history = buildHistoryFromHourly(series, true)
  assert.equal(history.total.length, 3)
})

test('buildHistoryFromHourly: complete flag is passed through', () => {
  const series = appSeriesFromHourly(FIXTURE, ['usdc'])
  assert.equal(buildHistoryFromHourly(series, true).complete, true)
  assert.equal(buildHistoryFromHourly(series, false).complete, false)
})

test('buildHistoryFromHourly: coveredMs = hours * 3600000', () => {
  const series = appSeriesFromHourly(FIXTURE, ['usdc'])
  const history = buildHistoryFromHourly(series, true)
  assert.equal(history.coveredMs, 3 * 3_600_000)
})

test('buildHistoryFromHourly: total txCount is sum of all apps', () => {
  const series = appSeriesFromHourly(FIXTURE, ['usdc', 'eurc'])
  const history = buildHistoryFromHourly(series, true)
  // T00: usdc=17874, eurc=484 → total=18358
  assert.equal(history.total[0].txCount, 17874 + 484)
})

test('buildHistoryFromHourly: empty series → empty total and zero coveredMs', () => {
  const history = buildHistoryFromHourly({}, true)
  assert.equal(history.total.length, 0)
  assert.equal(history.coveredMs, 0)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log()
console.log(`hourlyApps: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
