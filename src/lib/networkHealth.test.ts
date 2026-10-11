/**
 * Tests for src/lib/networkHealth.ts
 * Run: node --experimental-strip-types src/lib/networkHealth.test.ts
 */
import assert from 'node:assert/strict'
import { parseLatest, isLatestFresh, networkHealthCards, successRateSeries } from './networkHealth.ts'

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

const makeWindow = (overrides?: Record<string, unknown>) => ({
  hours: 24, blocks: 5000, txs: 1000, failed: 10, fees: 3.5, walletHours: 200, top: [],
  ...overrides,
})

const makeSnap = (overrides?: Record<string, unknown>) => ({
  network: 'testnet',
  generatedAt: new Date().toISOString(),
  windows: { '1h': makeWindow(), '24h': makeWindow(), '7d': makeWindow() },
  series: [],
  ...overrides,
})

console.log('\nparseLatest')

test('parses a valid snapshot', () => {
  const snap = parseLatest(makeSnap())
  assert.ok(snap)
  assert.equal(snap.network, 'testnet')
  assert.equal(snap.windows['24h'].txs, 1000)
})

test('returns null for null', () => {
  assert.equal(parseLatest(null), null)
})

test('returns null for non-object', () => {
  assert.equal(parseLatest('hello'), null)
})

test('returns null when network is missing', () => {
  assert.equal(parseLatest({ ...makeSnap(), network: undefined }), null)
})

test('returns null when a window is malformed', () => {
  const bad = makeSnap({ windows: { '1h': { txs: 'oops' }, '24h': makeWindow(), '7d': makeWindow() } })
  assert.equal(parseLatest(bad), null)
})

test('returns null when generatedAt is missing', () => {
  assert.equal(parseLatest({ ...makeSnap(), generatedAt: '' }), null)
})

test('parses series array, skips malformed points', () => {
  const snap = parseLatest({
    ...makeSnap(),
    series: [
      { hour: '2026-10-10T01', txs: 100, failed: 5, fees: 1.0, wallets: 20, blocks: 200 },
      { hour: 'bad', txs: 'nope' }, // malformed — dropped
    ],
  })
  assert.ok(snap)
  assert.equal(snap.series.length, 1)
  assert.equal(snap.series[0].hour, '2026-10-10T01')
})

console.log('\nisLatestFresh')

test('fresh snapshot → true', () => {
  const now = Date.now()
  const snap = parseLatest(makeSnap({ generatedAt: new Date(now - 1_000).toISOString() }))
  assert.ok(isLatestFresh(snap, 3 * 3_600_000, now))
})

test('old snapshot → false', () => {
  const now = Date.now()
  const snap = parseLatest(makeSnap({ generatedAt: new Date(now - 4 * 3_600_000).toISOString() }))
  assert.ok(!isLatestFresh(snap, 3 * 3_600_000, now))
})

test('null → false', () => {
  assert.ok(!isLatestFresh(null))
})

console.log('\nnetworkHealthCards')

test('normal case', () => {
  const cards = networkHealthCards(makeWindow({ txs: 1000, failed: 10, fees: 3.0 }))
  assert.equal(cards.txs, 1000)
  assert.equal(cards.successRate, 99)
  assert.ok(Math.abs((cards.avgFee ?? 0) - 0.003) < 0.0001)
})

test('txs === 0 → successRate and avgFee are null', () => {
  const cards = networkHealthCards(makeWindow({ txs: 0, failed: 0, fees: 0 }))
  assert.equal(cards.successRate, null)
  assert.equal(cards.avgFee, null)
  assert.equal(cards.txs, 0)
})

test('all failed → successRate 0', () => {
  const cards = networkHealthCards(makeWindow({ txs: 100, failed: 100, fees: 1.0 }))
  assert.equal(cards.successRate, 0)
})

console.log('\nsuccessRateSeries')

test('converts series points correctly', () => {
  const series = [
    { hour: '2026-10-10T01', txs: 200, failed: 20, fees: 1, wallets: 10, blocks: 100 },
    { hour: '2026-10-10T02', txs: 0, failed: 0, fees: 0, wallets: 0, blocks: 0 },
  ]
  const snap = parseLatest({ ...makeSnap(), series })!
  const pts = successRateSeries(snap.series, 48)
  assert.equal(pts.length, 2)
  assert.equal(pts[0].successRate, 90)
  assert.equal(pts[1].successRate, null) // txs === 0
})

test('limits to last N points', () => {
  const series = Array.from({ length: 60 }, (_, i) => ({
    hour: `2026-10-10T${String(i).padStart(2, '0')}`,
    txs: 100, failed: 5, fees: 1, wallets: 10, blocks: 200,
  }))
  const snap = parseLatest({ ...makeSnap(), series })!
  const pts = successRateSeries(snap.series, 48)
  assert.equal(pts.length, 48)
})

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
