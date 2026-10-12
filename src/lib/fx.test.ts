/**
 * Tests for src/lib/fx.ts
 * Run with: node --experimental-strip-types src/lib/fx.test.ts
 *
 * Reads the sample fixture from env FX_SAMPLE
 * (default: src/lib/fixtures/catalog/testnet-fx.json).
 *
 * NOTE: the series in the fixture is synthetic test data; only
 * usdcPerEurc / eurcPerUsdc from the last real reading are real values.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseFx, isFxFresh, changeTone, fxFormat, fxCsvRows } from './fx.ts'

// ---------------------------------------------------------------------------
// Load fixture
// ---------------------------------------------------------------------------

const fixturePath =
  process.env['FX_SAMPLE'] ?? 'src/lib/fixtures/catalog/testnet-fx.json'

const rawJson: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'))

// ---------------------------------------------------------------------------
// parseFx — happy path
// ---------------------------------------------------------------------------

const doc = parseFx(rawJson)
assert.ok(doc !== null, 'parseFx should accept the sample fixture')
assert.equal(doc.network, 'testnet')
assert.ok(typeof doc.usdcPerEurc === 'number' && isFinite(doc.usdcPerEurc))
assert.ok(typeof doc.eurcPerUsdc === 'number' && isFinite(doc.eurcPerUsdc))
assert.ok(doc.series.length > 0, 'series should be non-empty')
assert.equal(doc.pool, '0x2d84d79c852f6842abe0304b70bbaa1506add457')

// ---------------------------------------------------------------------------
// parseFx — rejection cases
// ---------------------------------------------------------------------------

assert.equal(parseFx(null), null, 'rejects null')
assert.equal(parseFx(42), null, 'rejects number')
assert.equal(parseFx('string'), null, 'rejects string')
assert.equal(parseFx([]), null, 'rejects array')

// usdcPerEurc = 0
assert.equal(
  parseFx({ ...rawJson as object, usdcPerEurc: 0 }),
  null,
  'rejects usdcPerEurc = 0',
)

// usdcPerEurc negative
assert.equal(
  parseFx({ ...rawJson as object, usdcPerEurc: -1 }),
  null,
  'rejects negative usdcPerEurc',
)

// usdcPerEurc NaN
assert.equal(
  parseFx({ ...rawJson as object, usdcPerEurc: NaN }),
  null,
  'rejects NaN usdcPerEurc',
)

// empty series — all entries stripped, length becomes 0
assert.equal(
  parseFx({ ...rawJson as object, series: [] }),
  null,
  'rejects empty series',
)

// missing pool
assert.equal(
  parseFx({ ...rawJson as object, source: { label: 'ok', pool: 'not-an-address' } }),
  null,
  'rejects bad pool address',
)
assert.equal(
  parseFx({ ...rawJson as object, source: { label: 'ok' } }),
  null,
  'rejects missing pool',
)

// ---------------------------------------------------------------------------
// parseFx — drops bad series entries but keeps the rest in order
// ---------------------------------------------------------------------------

const rawWithBadEntry = {
  ...(rawJson as object),
  series: [
    { hour: '2026-10-10T12', usdcPerEurc: 1.1376 },   // valid
    { hour: 'bad-hour', usdcPerEurc: 1.1384 },          // bad hour — dropped
    { hour: '2026-10-10T14', usdcPerEurc: -1 },         // negative — dropped
    { hour: '2026-10-10T15', usdcPerEurc: 1.138 },      // valid
  ],
}

const docPartial = parseFx(rawWithBadEntry)
assert.ok(docPartial !== null, 'accepts doc with some bad series entries')
assert.equal(docPartial.series.length, 2, 'drops 2 bad entries, keeps 2 good ones')
assert.equal(docPartial.series[0].hour, '2026-10-10T12', 'first entry preserved in order')
assert.equal(docPartial.series[1].hour, '2026-10-10T15', 'second entry preserved in order')

// ---------------------------------------------------------------------------
// isFxFresh
// ---------------------------------------------------------------------------

assert.ok(doc !== null)
const generatedAtMs = Date.parse(doc.generatedAt)   // 2026-10-12T10:03:14.108Z

// 2h 59m after generatedAt — should be fresh (within 3h window)
const now2h59 = generatedAtMs + (2 * 3_600_000 + 59 * 60_000)
assert.ok(isFxFresh(doc, now2h59), 'fresh at 2h59m')

// 3h 01m after generatedAt — should be stale
const now3h01 = generatedAtMs + (3 * 3_600_000 + 1 * 60_000)
assert.ok(!isFxFresh(doc, now3h01), 'stale at 3h01m')

// ---------------------------------------------------------------------------
// changeTone
// ---------------------------------------------------------------------------

assert.equal(changeTone(null), 'none', 'null -> none')
assert.equal(changeTone(0.99), 'normal', '0.99 -> normal')
assert.equal(changeTone(-0.99), 'normal', '-0.99 -> normal')
assert.equal(changeTone(1.0), 'normal', '1.0 is not > 1, so normal')
assert.equal(changeTone(1.01), 'warn', '1.01 -> warn')
assert.equal(changeTone(-1.01), 'warn', '-1.01 -> warn')
assert.equal(changeTone(1.5), 'warn', '1.5 -> warn')

// ---------------------------------------------------------------------------
// fxFormat
// ---------------------------------------------------------------------------

assert.equal(fxFormat(1.138493), '1.1385', 'fxFormat rounds to 4dp correctly')
assert.equal(fxFormat(1.0), '1.0000', 'fxFormat pads zeros')

// ---------------------------------------------------------------------------
// fxCsvRows
// ---------------------------------------------------------------------------

assert.ok(doc !== null)
const rows = fxCsvRows(doc)
assert.equal(rows.length, doc.series.length, 'fxCsvRows length matches series')

// Hand-computed reciprocal for the first row:
// series[0].usdcPerEurc = 1.1376 (from fixture)
// eurc_per_usdc = round(1/1.1376 * 1_000_000) / 1_000_000
const expectedReciprocal = Math.round((1 / doc.series[0].usdcPerEurc) * 1_000_000) / 1_000_000
assert.equal(rows[0].eurc_per_usdc, expectedReciprocal, 'first row reciprocal matches hand-computed value')
assert.equal(rows[0].usdc_per_eurc, doc.series[0].usdcPerEurc, 'first row usdc_per_eurc matches series')

// ---------------------------------------------------------------------------
// All tests passed
// ---------------------------------------------------------------------------

console.log('fx.test.ts: all tests passed')
