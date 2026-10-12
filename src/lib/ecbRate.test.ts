/**
 * Tests for src/lib/ecbRate.ts
 * Run with: node --experimental-strip-types --no-warnings src/lib/ecbRate.test.ts
 *
 * Sample data is embedded inline (trimmed from a real Frankfurter response for
 * GET /v1/2026-10-01..2026-10-12?base=EUR&symbols=USD).
 */

import assert from 'node:assert/strict'
import {
  parseEcbRate,
  ecbRangeUrl,
  isEcbFresh,
  ecbCsvRows,
  type EcbRate,
} from './ecbRate.ts'

// ---------------------------------------------------------------------------
// Inline fixtures
// ---------------------------------------------------------------------------

// Range shape — real response, dates 2026-10-01 through 2026-10-12.
// ECB skips weekends, so 2026-10-03/04, 2026-10-10/11 are absent.
const RANGE_RAW = {
  amount: 1.0,
  base: 'EUR',
  start_date: '2026-10-01',
  end_date: '2026-10-12',
  rates: {
    '2026-10-01': { USD: 1.1298 },
    '2026-10-02': { USD: 1.1225 },
    '2026-10-05': { USD: 1.1204 },
    '2026-10-06': { USD: 1.1269 },
    '2026-10-07': { USD: 1.1177 },
    '2026-10-08': { USD: 1.1186 },
    '2026-10-09': { USD: 1.1206 },
    '2026-10-12': { USD: 1.1181 },
  },
}

// Latest (single-day) shape — mirrors /v1/latest response.
const LATEST_RAW = {
  amount: 1.0,
  base: 'EUR',
  date: '2026-10-12',
  rates: { USD: 1.1181 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

// ---------------------------------------------------------------------------
// parseEcbRate — range shape happy path
// ---------------------------------------------------------------------------

const rangeResult = parseEcbRate(RANGE_RAW)
assert.ok(rangeResult !== null, 'parseEcbRate accepts range shape')
assert.equal(rangeResult.latestDay, '2026-10-12', 'latestDay is the last sorted day')
assert.equal(rangeResult.usdPerEur, 1.1181, 'usdPerEur matches last entry')
assert.equal(
  round6(rangeResult.eurPerUsd),
  round6(1 / 1.1181),
  'eurPerUsd is reciprocal of usdPerEur',
)
assert.equal(rangeResult.series.length, 8, 'series has 8 entries (all valid days)')

// Series must be sorted ascending by day.
for (let i = 1; i < rangeResult.series.length; i++) {
  assert.ok(
    rangeResult.series[i].day > rangeResult.series[i - 1].day,
    `series entry ${i} is in ascending order`,
  )
}

// change1dPct: (1.1181 - 1.1206) / 1.1206 * 100
const expectedChange = ((1.1181 - 1.1206) / 1.1206) * 100
assert.equal(
  round6(rangeResult.change1dPct as number),
  round6(expectedChange),
  'change1dPct matches hand-computed value to 6 decimal places',
)

// Spot-check series values.
assert.equal(rangeResult.series[0].day, '2026-10-01')
assert.equal(rangeResult.series[0].usdPerEur, 1.1298)
assert.equal(rangeResult.series[7].day, '2026-10-12')
assert.equal(rangeResult.series[7].usdPerEur, 1.1181)

// ---------------------------------------------------------------------------
// parseEcbRate — latest (single-day) shape
// ---------------------------------------------------------------------------

const latestResult = parseEcbRate(LATEST_RAW)
assert.ok(latestResult !== null, 'parseEcbRate accepts latest shape')
assert.equal(latestResult.latestDay, '2026-10-12', 'latestDay from latest shape')
assert.equal(latestResult.usdPerEur, 1.1181, 'usdPerEur from latest shape')
assert.equal(latestResult.series.length, 1, 'single-day series has length 1')
assert.equal(latestResult.change1dPct, null, 'change1dPct is null for single-day')
assert.equal(
  round6(latestResult.eurPerUsd),
  round6(1 / 1.1181),
  'eurPerUsd correct for single-day',
)

// ---------------------------------------------------------------------------
// parseEcbRate — bad top-level shapes
// ---------------------------------------------------------------------------

assert.equal(parseEcbRate(null), null, 'rejects null')
assert.equal(parseEcbRate(undefined), null, 'rejects undefined')
assert.equal(parseEcbRate(42), null, 'rejects number')
assert.equal(parseEcbRate('string'), null, 'rejects string')
assert.equal(parseEcbRate([]), null, 'rejects array')
assert.equal(parseEcbRate([{ base: 'EUR', rates: { USD: 1.1 } }]), null, 'rejects array of objects')
assert.equal(parseEcbRate({}), null, 'rejects empty object (no base)')

// ---------------------------------------------------------------------------
// parseEcbRate — wrong base
// ---------------------------------------------------------------------------

assert.equal(
  parseEcbRate({ ...RANGE_RAW, base: 'USD' }),
  null,
  'rejects base !== EUR',
)
assert.equal(
  parseEcbRate({ ...RANGE_RAW, base: 'eur' }),
  null,
  'rejects lowercase base',
)
assert.equal(
  parseEcbRate({ ...RANGE_RAW, base: '' }),
  null,
  'rejects empty base',
)

// ---------------------------------------------------------------------------
// parseEcbRate — bad rates container
// ---------------------------------------------------------------------------

assert.equal(
  parseEcbRate({ ...RANGE_RAW, rates: null }),
  null,
  'rejects null rates',
)
assert.equal(
  parseEcbRate({ ...RANGE_RAW, rates: [] }),
  null,
  'rejects array rates',
)
assert.equal(
  parseEcbRate({ ...RANGE_RAW, rates: 'nope' }),
  null,
  'rejects string rates',
)

// ---------------------------------------------------------------------------
// parseEcbRate — all entries invalid → null
// ---------------------------------------------------------------------------

assert.equal(
  parseEcbRate({ ...RANGE_RAW, rates: {} }),
  null,
  'rejects empty rates object',
)

// All entries have bad day keys.
assert.equal(
  parseEcbRate({
    ...RANGE_RAW,
    rates: {
      'not-a-date': { USD: 1.1 },
      '2026/10/01': { USD: 1.1 },
      '20261001': { USD: 1.1 },
    },
  }),
  null,
  'rejects all-bad day keys',
)

// All entries have invalid USD.
assert.equal(
  parseEcbRate({
    ...RANGE_RAW,
    rates: {
      '2026-10-01': { USD: -1 },
      '2026-10-02': { USD: 0 },
      '2026-10-05': { USD: NaN },
      '2026-10-06': { USD: Infinity },
      '2026-10-07': { USD: -Infinity },
      '2026-10-08': { USD: '1.1' },
      '2026-10-09': { USD: 100 },
      '2026-10-12': { USD: 101 },
    },
  }),
  null,
  'rejects all-invalid USD values',
)

// ---------------------------------------------------------------------------
// parseEcbRate — drops bad entries, keeps good ones
// ---------------------------------------------------------------------------

const mixedResult = parseEcbRate({
  ...RANGE_RAW,
  rates: {
    '2026-10-01': { USD: 1.1298 },    // valid
    'bad-key': { USD: 1.13 },          // bad day key — dropped
    '2026-13-40': { USD: 1.13 },       // regex match but not real date — dropped
    '2026-02-30': { USD: 1.13 },       // regex match but Feb 30 not real — dropped
    '2026-10-02': { USD: -5 },         // negative USD — dropped
    '2026-10-05': { USD: NaN },        // NaN USD — dropped
    '2026-10-06': { USD: Infinity },   // Infinity USD — dropped
    '2026-10-07': { USD: 'hello' },    // string USD — dropped
    '2026-10-08': { USD: 100 },        // USD >= 100 — dropped
    '2026-10-09': { USD: 1.1206 },     // valid
    '2026-10-12': { USD: 1.1181 },     // valid
  },
})

assert.ok(mixedResult !== null, 'accepts doc with some bad entries')
assert.equal(mixedResult.series.length, 3, 'keeps 3 valid entries, drops 8 bad ones')
assert.equal(mixedResult.series[0].day, '2026-10-01', 'first valid entry preserved')
assert.equal(mixedResult.series[1].day, '2026-10-09', 'second valid entry preserved')
assert.equal(mixedResult.series[2].day, '2026-10-12', 'third valid entry (latest) preserved')
assert.equal(mixedResult.latestDay, '2026-10-12')

// ---------------------------------------------------------------------------
// parseEcbRate — day-rate sub-object is not an object
// ---------------------------------------------------------------------------

const badSubObject = parseEcbRate({
  ...RANGE_RAW,
  rates: {
    '2026-10-01': null,          // not an object — dropped
    '2026-10-02': [{ USD: 1.1 }], // array — dropped
    '2026-10-05': 'string',      // string — dropped
    '2026-10-06': { USD: 1.1269 }, // valid
  },
})
assert.ok(badSubObject !== null, 'drops non-object day-rate values')
assert.equal(badSubObject.series.length, 1, 'only 1 valid entry remains')

// ---------------------------------------------------------------------------
// parseEcbRate — latest shape with bad date field
// ---------------------------------------------------------------------------

assert.equal(
  parseEcbRate({ ...LATEST_RAW, date: '2026-13-01' }),
  null,
  'latest shape: invalid month → null',
)
assert.equal(
  parseEcbRate({ ...LATEST_RAW, date: 'not-a-date' }),
  null,
  'latest shape: non-date string → null',
)
assert.equal(
  parseEcbRate({ ...LATEST_RAW, date: 42 }),
  null,
  'latest shape: number date → null',
)
assert.equal(
  parseEcbRate({ ...LATEST_RAW, rates: { USD: -1 } }),
  null,
  'latest shape: negative USD → null',
)
assert.equal(
  parseEcbRate({ ...LATEST_RAW, rates: { USD: NaN } }),
  null,
  'latest shape: NaN USD → null',
)
assert.equal(
  parseEcbRate({ ...LATEST_RAW, rates: { USD: Infinity } }),
  null,
  'latest shape: Infinity USD → null',
)

// ---------------------------------------------------------------------------
// parseEcbRate — change1dPct precision
// ---------------------------------------------------------------------------

// Two-entry series: 1.1206 → 1.1181
// change = (1.1181 - 1.1206) / 1.1206 * 100
const twoEntry = parseEcbRate({
  amount: 1.0,
  base: 'EUR',
  rates: {
    '2026-10-09': { USD: 1.1206 },
    '2026-10-12': { USD: 1.1181 },
  },
})
assert.ok(twoEntry !== null)
const expectedTwoEntry = round6(((1.1181 - 1.1206) / 1.1206) * 100)
assert.equal(
  round6(twoEntry.change1dPct as number),
  expectedTwoEntry,
  'change1dPct two-entry: correct to 6 decimals',
)

// ---------------------------------------------------------------------------
// ecbRangeUrl — basic
// ---------------------------------------------------------------------------

// 2026-10-12, 30 days back → start = 2026-09-12
assert.equal(
  ecbRangeUrl(new Date('2026-10-12T00:00:00Z'), 30),
  'https://api.frankfurter.dev/v1/2026-09-12..2026-10-12?base=EUR&symbols=USD',
  'ecbRangeUrl: 30 days back from 2026-10-12',
)

// Default days = 30
assert.equal(
  ecbRangeUrl(new Date('2026-10-12T00:00:00Z')),
  'https://api.frankfurter.dev/v1/2026-09-12..2026-10-12?base=EUR&symbols=USD',
  'ecbRangeUrl: default 30 days',
)

// Cross-month boundary: 2026-10-01, 30 days back → start = 2026-09-01
assert.equal(
  ecbRangeUrl(new Date('2026-10-01T00:00:00Z'), 30),
  'https://api.frankfurter.dev/v1/2026-09-01..2026-10-01?base=EUR&symbols=USD',
  'ecbRangeUrl: cross-month boundary',
)

// Cross-year boundary: 2026-01-01, 30 days back → start = 2025-12-02
assert.equal(
  ecbRangeUrl(new Date('2026-01-01T00:00:00Z'), 30),
  'https://api.frankfurter.dev/v1/2025-12-02..2026-01-01?base=EUR&symbols=USD',
  'ecbRangeUrl: cross-year boundary',
)

// 1 day range
assert.equal(
  ecbRangeUrl(new Date('2026-05-15T00:00:00Z'), 1),
  'https://api.frankfurter.dev/v1/2026-05-14..2026-05-15?base=EUR&symbols=USD',
  'ecbRangeUrl: 1-day range',
)

// Month-end: 2026-03-01, 1 day → start = 2026-02-28
assert.equal(
  ecbRangeUrl(new Date('2026-03-01T00:00:00Z'), 1),
  'https://api.frankfurter.dev/v1/2026-02-28..2026-03-01?base=EUR&symbols=USD',
  'ecbRangeUrl: march 1st minus 1 day = feb 28',
)

// Zero-pad month and day
assert.equal(
  ecbRangeUrl(new Date('2026-02-05T00:00:00Z'), 7),
  'https://api.frankfurter.dev/v1/2026-01-29..2026-02-05?base=EUR&symbols=USD',
  'ecbRangeUrl: zero-padded month/day',
)

// Uses UTC, not local time — test by using a UTC date at midnight.
// Regardless of local timezone the result should use UTC dates.
const utcDate = new Date(Date.UTC(2026, 9, 12)) // 2026-10-12 UTC
assert.equal(
  ecbRangeUrl(utcDate, 30),
  'https://api.frankfurter.dev/v1/2026-09-12..2026-10-12?base=EUR&symbols=USD',
  'ecbRangeUrl: uses UTC dates',
)

// ---------------------------------------------------------------------------
// isEcbFresh
// ---------------------------------------------------------------------------

// Build a rate whose latestDay is 2026-10-12.
const freshRate = parseEcbRate(LATEST_RAW)
assert.ok(freshRate !== null)

const latestDayMs = Date.parse('2026-10-12')  // start of that UTC day

// Exactly at maxAgeMs boundary → fresh (<=).
const exactly5d = latestDayMs + 5 * 86_400_000
assert.ok(isEcbFresh(freshRate, exactly5d), 'fresh exactly at 5d boundary')

// 1ms over boundary → stale.
assert.ok(!isEcbFresh(freshRate, exactly5d + 1), 'stale 1ms past 5d boundary')

// Well within window.
assert.ok(isEcbFresh(freshRate, latestDayMs + 86_400_000), 'fresh 1 day after latestDay')

// Before publication day (now < latestDay) — now - latestDayMs is negative → <=
// maxAgeMs so it's considered fresh (the rate is from the future relative to
// caller's clock, which is a client-clock-skew scenario).
assert.ok(
  isEcbFresh(freshRate, latestDayMs - 1000),
  'fresh when clock is slightly behind latestDay',
)

// Custom maxAgeMs
assert.ok(isEcbFresh(freshRate, latestDayMs + 86_400_000, 2 * 86_400_000), 'fresh with 2d window')
assert.ok(!isEcbFresh(freshRate, latestDayMs + 3 * 86_400_000, 2 * 86_400_000), 'stale with 2d window')

// Unparseable latestDay → false.
const badDayRate: EcbRate = {
  latestDay: 'not-a-date',
  usdPerEur: 1.12,
  eurPerUsd: 1 / 1.12,
  change1dPct: null,
  series: [{ day: 'not-a-date', usdPerEur: 1.12 }],
}
assert.ok(!isEcbFresh(badDayRate), 'unparseable latestDay → false')

// Day matches regex but isn't a real date — DAY_RE passes but Date.parse may produce NaN.
const weirdDayRate: EcbRate = {
  latestDay: '2026-13-40',
  usdPerEur: 1.12,
  eurPerUsd: 1 / 1.12,
  change1dPct: null,
  series: [{ day: '2026-13-40', usdPerEur: 1.12 }],
}
// Date.parse('2026-13-40') is NaN or otherwise unreliable — either way the rate
// should be treated as stale/unparseable.
// We just ensure it doesn't throw.
const weirdResult = isEcbFresh(weirdDayRate)
assert.ok(typeof weirdResult === 'boolean', 'isEcbFresh returns boolean for weird day')

// ---------------------------------------------------------------------------
// ecbCsvRows
// ---------------------------------------------------------------------------

assert.ok(rangeResult !== null)
const csvRows = ecbCsvRows(rangeResult)
assert.equal(csvRows.length, rangeResult.series.length, 'csvRows length matches series')

// First row.
assert.equal(csvRows[0].day, '2026-10-01')
assert.equal(csvRows[0].usd_per_eur, 1.1298)
assert.equal(csvRows[0].eur_per_usd, 1 / 1.1298, 'first row eur_per_usd is raw reciprocal')

// Last row.
assert.equal(csvRows[csvRows.length - 1].day, '2026-10-12')
assert.equal(csvRows[csvRows.length - 1].usd_per_eur, 1.1181)
assert.equal(
  csvRows[csvRows.length - 1].eur_per_usd,
  1 / 1.1181,
  'last row eur_per_usd is raw reciprocal',
)

// All rows have correct structure.
for (const row of csvRows) {
  assert.ok(typeof row.day === 'string', 'row.day is string')
  assert.ok(typeof row.usd_per_eur === 'number', 'row.usd_per_eur is number')
  assert.ok(typeof row.eur_per_usd === 'number', 'row.eur_per_usd is number')
  assert.ok(row.eur_per_usd > 0 && isFinite(row.eur_per_usd), 'row.eur_per_usd is positive finite')
}

// Single-day latest shape CSV.
assert.ok(latestResult !== null)
const csvLatest = ecbCsvRows(latestResult)
assert.equal(csvLatest.length, 1)
assert.equal(csvLatest[0].day, '2026-10-12')
assert.equal(csvLatest[0].usd_per_eur, 1.1181)
assert.equal(csvLatest[0].eur_per_usd, 1 / 1.1181)

// Pin: calendar-invalid days (valid month, day overflow) are dropped
assert.equal(
  parseEcbRate({ base: 'EUR', rates: { '2026-02-30': { USD: 1.1 } } }),
  null,
)
// Pin: long ranges shift by exact whole days
assert.equal(
  ecbRangeUrl(new Date(Date.UTC(2026, 9, 12)), 365),
  'https://api.frankfurter.dev/v1/2025-10-12..2026-10-12?base=EUR&symbols=USD',
)
// Pin: /latest shape with extra symbols is not accepted
assert.equal(
  parseEcbRate({ base: 'EUR', date: '2026-10-12', rates: { USD: 1.1, GBP: 0.8 } }),
  null,
)

// ---------------------------------------------------------------------------
// All tests passed
// ---------------------------------------------------------------------------

console.log('ecbRate.test.ts: all tests passed')
