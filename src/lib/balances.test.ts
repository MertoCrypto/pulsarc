/**
 * Tests for src/lib/balances.ts
 *
 * Run with:
 *   node --experimental-strip-types src/lib/balances.test.ts
 *
 * Reads real sample files from the directory given by the env var
 * BALANCES_SAMPLES (default: src/lib/fixtures/catalog).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Import the real module (not a mock).
import {
  parseBalances,
  isBalancesFresh,
  topHolders,
  changeSince,
  formatUsdc,
  type BalancesDoc,
} from './balances.ts'

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const SAMPLES_DIR =
  process.env['BALANCES_SAMPLES'] ?? 'src/lib/fixtures/catalog'

function loadSample(name: string): unknown {
  const raw = readFileSync(join(SAMPLES_DIR, name), 'utf8')
  return JSON.parse(raw)
}

// ---------------------------------------------------------------------------
// 1. parseBalances — real samples
// ---------------------------------------------------------------------------

{
  const mainnetRaw = loadSample('mainnet-balances.json')
  const mainnetDoc = parseBalances(mainnetRaw)
  assert.ok(mainnetDoc !== null, 'mainnet sample should parse successfully')
  assert.equal(mainnetDoc.network, 'mainnet', 'network = mainnet')
  assert.ok(
    typeof mainnetDoc.generatedAt === 'string',
    'generatedAt is a string',
  )
  assert.ok(mainnetDoc.total >= 0, 'total >= 0')
  assert.ok(mainnetDoc.apps.length > 0, 'apps array non-empty')
  assert.ok(mainnetDoc.series.length > 0, 'series array non-empty')

  const testnetRaw = loadSample('testnet-balances.json')
  const testnetDoc = parseBalances(testnetRaw)
  assert.ok(testnetDoc !== null, 'testnet sample should parse successfully')
  assert.equal(testnetDoc.network, 'testnet', 'network = testnet')

  console.log('PASS: parseBalances accepts both real samples')
}

// ---------------------------------------------------------------------------
// 2. parseBalances — top-level rejection cases
// ---------------------------------------------------------------------------

{
  assert.equal(parseBalances(null), null, 'rejects null')
  assert.equal(parseBalances(42), null, 'rejects number')
  assert.equal(parseBalances([]), null, 'rejects array')
  assert.equal(parseBalances({}), null, 'rejects empty object (missing network)')
  assert.equal(
    parseBalances({ network: 123, generatedAt: 'x', total: 0, apps: {}, series: [] }),
    null,
    'rejects non-string network',
  )
  assert.equal(
    parseBalances({ network: 'x', generatedAt: 42, total: 0, apps: {}, series: [] }),
    null,
    'rejects non-string generatedAt',
  )
  assert.equal(
    parseBalances({ network: 'x', generatedAt: 'x', total: -1, apps: { a: { usdc: 1 } }, series: [] }),
    null,
    'rejects negative total',
  )
  assert.equal(
    parseBalances({ network: 'x', generatedAt: 'x', total: Infinity, apps: { a: { usdc: 1 } }, series: [] }),
    null,
    'rejects non-finite total',
  )
  assert.equal(
    parseBalances({ network: 'x', generatedAt: 'x', total: 0, apps: 'bad', series: [] }),
    null,
    'rejects non-object apps',
  )
  // No valid apps remain => null
  assert.equal(
    parseBalances({ network: 'x', generatedAt: 'x', total: 0, apps: { a: { usdc: -5 } }, series: [] }),
    null,
    'rejects when no valid apps remain (all negative)',
  )

  console.log('PASS: parseBalances rejects invalid top-level shapes')
}

// ---------------------------------------------------------------------------
// 3. parseBalances — bad apps are dropped but valid ones are kept (in order)
// ---------------------------------------------------------------------------

{
  const raw = {
    network: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    total: 300,
    apps: {
      alpha: { usdc: 100 },
      bad_neg: { usdc: -5 },
      beta: { usdc: 200 },
      bad_inf: { usdc: Infinity },
      gamma: { usdc: 0 },
    },
    series: [{ hour: '2026-01-01T00', total: 300 }],
  }
  const doc = parseBalances(raw)
  assert.ok(doc !== null, 'parsed despite bad apps')
  // Only alpha, beta, gamma survive (bad_neg and bad_inf are dropped)
  assert.deepEqual(
    doc.apps.map(a => a.id),
    ['alpha', 'beta', 'gamma'],
    'drops bad apps and preserves order of valid ones',
  )

  console.log('PASS: parseBalances drops bad app entries but keeps valid ones in order')
}

// ---------------------------------------------------------------------------
// 4. topHolders on the real mainnet sample
// ---------------------------------------------------------------------------

{
  const raw = loadSample('mainnet-balances.json')
  const doc = parseBalances(raw)
  assert.ok(doc !== null)

  // Raw numbers from the fixture (gateway: 12560870.47, across: 1132.77,
  // cctp/erc8004/memo/multicall/stablefx/uniswap: 0)
  const total = 12562003.24

  // Only apps with usdc > 0 should appear
  const holders = topHolders(doc)
  assert.ok(
    holders.every(h => h.usdc > 0),
    'only apps with usdc > 0',
  )

  // Descending order (source order already descending by the spec)
  for (let i = 1; i < holders.length; i++) {
    assert.ok(holders[i - 1].usdc >= holders[i].usdc, 'descending usdc order')
  }

  // Spot-check gateway share
  const gateway = holders.find(h => h.id === 'gateway')
  assert.ok(gateway !== undefined, 'gateway is in holders')
  const expectedShare = Math.round((12560870.47 / total) * 1000) / 10
  assert.equal(
    gateway.sharePct,
    expectedShare,
    `gateway sharePct = ${expectedShare}`,
  )

  // n is respected
  const limited = topHolders(doc, 1)
  assert.equal(limited.length, 1, 'n=1 limits to 1 result')
  assert.equal(limited[0].id, 'gateway', 'top holder is gateway')

  console.log('PASS: topHolders on real mainnet sample')
}

// ---------------------------------------------------------------------------
// 5. isBalancesFresh — boundary conditions
// ---------------------------------------------------------------------------

{
  const generatedAt = '2026-06-15T12:00:00.000Z'
  const base = Date.parse(generatedAt)

  const doc: BalancesDoc = {
    network: 'test',
    generatedAt,
    total: 0,
    apps: [{ id: 'x', usdc: 0 }],
    series: [],
  }

  const maxAgeMs = 3 * 3_600_000 // 3 hours

  // 2h59m after generatedAt => within window => fresh
  const twoH59 = base + 2 * 3_600_000 + 59 * 60_000
  assert.equal(isBalancesFresh(doc, twoH59, maxAgeMs), true, 'fresh at 2h59m')

  // 3h01m after generatedAt => outside window => stale
  const threeH01 = base + 3 * 3_600_000 + 1 * 60_000
  assert.equal(isBalancesFresh(doc, threeH01, maxAgeMs), false, 'stale at 3h01m')

  console.log('PASS: isBalancesFresh at 2h59m (fresh) and 3h01m (stale)')
}

// ---------------------------------------------------------------------------
// 6. changeSince — synthetic series
// Note: the series below is synthetic (not from the real samples) and is
//       constructed entirely within this test to exercise edge cases.
// ---------------------------------------------------------------------------

{
  // Build a 30-point hourly series starting at 2026-03-01T00 UTC.
  // total grows by 100 per hour so we can predict changes precisely.
  const START_MS = Date.parse('2026-03-01T00:00:00Z')
  const syntheticSeries: { hour: string; total: number }[] = []
  for (let i = 0; i < 30; i++) {
    const ms = START_MS + i * 3_600_000
    const d = new Date(ms)
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const hour =
      `${d.getUTCFullYear()}-` +
      `${pad2(d.getUTCMonth() + 1)}-` +
      `${pad2(d.getUTCDate())}T` +
      `${pad2(d.getUTCHours())}`
    syntheticSeries.push({ hour, total: 1000 + i * 100 })
  }
  // Last point: hour index 29, total = 1000 + 29*100 = 3900
  // Point 24h (index 5)  before last: total = 1000 + 5*100 = 1500
  // change = (3900 - 1500) / 1500 * 100 = 160.00 %
  const change24 = changeSince(syntheticSeries, 24)
  assert.ok(change24 !== null, 'changeSince returns a number for synthetic series (24h)')
  assert.equal(change24, 160.00, 'changeSince 24h = 160.00%')

  // hoursBack = 5: last is index 29 (3900), earlier is index 24 (3400)
  // change = (3900 - 3400) / 3400 * 100 = 14.71%
  const change5 = changeSince(syntheticSeries, 5)
  assert.ok(change5 !== null)
  assert.equal(change5, Math.round(((3900 - 3400) / 3400) * 10000) / 100, 'changeSince 5h')

  // Missing earlier point: hoursBack = 100 (series only spans 29h)
  const changeMissing = changeSince(syntheticSeries, 100)
  assert.equal(changeMissing, null, 'missing earlier point -> null')

  // Earlier total = 0 -> null
  const seriesWithZero: { hour: string; total: number }[] = [
    { hour: '2026-01-01T00', total: 0 },
    { hour: '2026-01-01T01', total: 500 },
  ]
  const changeFromZero = changeSince(seriesWithZero, 1)
  assert.equal(changeFromZero, null, 'earlier total 0 -> null')

  console.log('PASS: changeSince with synthetic series')
}

// ---------------------------------------------------------------------------
// 7. formatUsdc
// ---------------------------------------------------------------------------

{
  assert.equal(formatUsdc(0), '$0.00', 'formatUsdc(0)')
  // 999.994 rounds to 999.99 at 2dp — no K threshold crossed
  assert.equal(formatUsdc(999.994), '$999.99', 'formatUsdc(999.994)')
  // 1234.5 >= 1e3 -> K: 1.2345 -> $1.23K
  assert.equal(formatUsdc(1234.5), '$1.23K', 'formatUsdc(1234.5)')
  // 12562003.24 >= 1e6 -> M: 12.56200324 -> $12.56M
  assert.equal(formatUsdc(12562003.24), '$12.56M', 'formatUsdc(12562003.24)')
  // 1.5e9 >= 1e9 -> B: 1.5 -> $1.50B
  assert.equal(formatUsdc(1.5e9), '$1.50B', 'formatUsdc(1.5e9)')

  console.log('PASS: formatUsdc cases')
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log('\nAll tests passed.')

// formatUsdc rolls over at the unit boundary after rounding
assert.equal(formatUsdc(999999.99), '$1.00M')
assert.equal(formatUsdc(999999999.99), '$1.00B')
assert.equal(formatUsdc(999.994), '$999.99')
console.log('formatUsdc: unit boundary OK')

