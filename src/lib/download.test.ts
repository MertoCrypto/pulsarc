/**
 * Tests for src/lib/download.ts
 * Run with: node --experimental-strip-types src/lib/download.test.ts
 *
 * Uses only node:assert — no test framework required.
 * Does NOT test DOM functions (svgToPngDataUrl, triggerDownload).
 */

import assert from 'node:assert/strict'
import { csvEscape, toCsv, downloadFileName } from './download.ts'

// ---------------------------------------------------------------------------
// csvEscape
// ---------------------------------------------------------------------------

// Plain string — no quoting needed
assert.equal(csvEscape('hello'), 'hello', 'plain string')

// Number via String()
assert.equal(csvEscape(42), '42', 'number')
assert.equal(csvEscape(-7.5), '-7.5', 'negative number')

// null and undefined -> empty
assert.equal(csvEscape(null), '', 'null')
assert.equal(csvEscape(undefined), '', 'undefined')

// Comma triggers quoting
assert.equal(csvEscape('a,b'), '"a,b"', 'comma')

// Double-quote triggers quoting and doubling
assert.equal(csvEscape('say "hi"'), '"say ""hi"""', 'double-quote')

// CR triggers quoting
assert.equal(csvEscape('line1\rline2'), '"line1\rline2"', 'CR')

// LF triggers quoting
assert.equal(csvEscape('line1\nline2'), '"line1\nline2"', 'LF')

// Both comma AND quote
assert.equal(csvEscape('a,"b"'), '"a,""b"""', 'comma and quote')

// ---------------------------------------------------------------------------
// toCsv — metadata line
// ---------------------------------------------------------------------------

const fixedDate = new Date('2026-03-15T12:00:00.000Z')
const columns = [
  { key: 'ts', label: 'Timestamp' },
  { key: 'val', label: 'Value' },
]
const rows = [
  { ts: '2026-03-15', val: 99 },
  { ts: '2026-03-16', val: 100 },
]

const csv = toCsv({ source: 'pulsarc/test', generatedAt: fixedDate, columns, rows })
const csvLines = csv.split('\r\n')

// Metadata first line
assert.equal(
  csvLines[0],
  '# source: pulsarc/test; generated: 2026-03-15T12:00:00.000Z',
  'metadata line',
)

// Header row
assert.equal(csvLines[1], 'Timestamp,Value', 'header row')

// First data row
assert.equal(csvLines[2], '2026-03-15,99', 'first data row')

// Second data row
assert.equal(csvLines[3], '2026-03-16,100', 'second data row')

// Trailing CRLF means last split token is empty string
assert.equal(csvLines[csvLines.length - 1], '', 'trailing CRLF')

// Row order preserved
const twoRows = toCsv({ source: 's', generatedAt: fixedDate, columns, rows })
const twoLines = twoRows.split('\r\n')
assert.equal(twoLines[2], '2026-03-15,99', 'row order first')
assert.equal(twoLines[3], '2026-03-16,100', 'row order second')

// ---------------------------------------------------------------------------
// toCsv — formula-injection prefix for strings
// ---------------------------------------------------------------------------

const injectionCols = [{ key: 'v', label: 'V' }]

// String starting with '=' must be prefixed with single quote
const csvEq = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: '=SUM(A1:A2)' }],
})
assert.ok(
  csvEq.split('\r\n')[2].includes("'=SUM(A1:A2)"),
  "formula '=' prefix",
)

// String starting with '+' must be prefixed
const csvPlus = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: '+1' }],
})
assert.ok(csvPlus.split('\r\n')[2].startsWith("'+1"), "formula '+' prefix")

// String starting with '-' must be prefixed
const csvMinus = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: '-evil' }],
})
assert.ok(csvMinus.split('\r\n')[2].startsWith("'-evil"), "formula '-' string prefix")

// String starting with '@' must be prefixed
const csvAt = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: '@user' }],
})
assert.ok(csvAt.split('\r\n')[2].startsWith("'@user"), "formula '@' prefix")

// ---------------------------------------------------------------------------
// toCsv — negative numbers must NOT get the injection prefix
// ---------------------------------------------------------------------------

const csvNeg = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: -42 }],
})
// Cell must be exactly -42 with no leading quote
assert.equal(csvNeg.split('\r\n')[2], '-42', 'negative number stays numeric')

// Large negative with decimal
const csvNegFloat = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: -3.14 }],
})
assert.equal(csvNegFloat.split('\r\n')[2], '-3.14', 'negative float stays numeric')

// ---------------------------------------------------------------------------
// toCsv — null cell
// ---------------------------------------------------------------------------

const csvNull = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: null }],
})
assert.equal(csvNull.split('\r\n')[2], '', 'null cell is empty')

const csvUndef = toCsv({
  source: 's', generatedAt: fixedDate,
  columns: injectionCols,
  rows: [{ v: undefined }],
})
assert.equal(csvUndef.split('\r\n')[2], '', 'undefined cell is empty')

// ---------------------------------------------------------------------------
// downloadFileName
// ---------------------------------------------------------------------------

// Basic case
const d1 = new Date('2026-03-15T10:00:00.000Z')
assert.equal(
  downloadFileName('transactions', 'mainnet', d1, 'csv'),
  'pulsarc-transactions-mainnet-2026-03-15.csv',
  'basic file name csv',
)

assert.equal(
  downloadFileName('transactions', 'mainnet', d1, 'png'),
  'pulsarc-transactions-mainnet-2026-03-15.png',
  'basic file name png',
)

// Messy page name: uppercase, spaces, special chars
const d2 = new Date('2026-07-04T00:00:00.000Z')
assert.equal(
  downloadFileName('My Page!! v2', 'testnet', d2, 'csv'),
  'pulsarc-my-page-v2-testnet-2026-07-04.csv',
  'messy page name',
)

// Fixed date — page with multiple consecutive specials
assert.equal(
  downloadFileName('  --Top/Stats--  ', 'arc', d1, 'png'),
  'pulsarc-top-stats-arc-2026-03-15.png',
  'consecutive specials collapsed and stripped',
)

// UTC date near midnight: 2026-10-11T23:59:59-05:00 = 2026-10-12 UTC
const nearMidnight = new Date('2026-10-11T23:59:59-05:00') // 2026-10-12T04:59:59Z
assert.equal(
  downloadFileName('overview', 'arc', nearMidnight, 'csv'),
  'pulsarc-overview-arc-2026-10-12.csv',
  'UTC date near midnight',
)

// ---------------------------------------------------------------------------

console.log('All tests passed.')
