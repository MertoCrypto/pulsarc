/**
 * Tests for src/lib/anomalies.ts
 * Run with: node --experimental-strip-types src/lib/anomalies.test.ts
 */
import assert from 'node:assert/strict'
import { parseAnomalies, isAnomaliesFresh, describeAnomaly } from './anomalies.ts'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✔ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✖ ${name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

const now = Date.now()
const freshTs = new Date(now - 60_000).toISOString()       // 1 min ago
const staleTs = new Date(now - 4 * 3_600_000).toISOString() // 4 hours ago

const validSnap = {
  network: 'testnet',
  generatedAt: freshTs,
  status: 'ok',
  hour: '2026-10-10T11',
  items: [
    { app: 'usdc', kind: 'spike', ratio: 2.5, txs: 1000, baseline: 400 },
    { app: 'eurc', kind: 'drop', ratio: 0.1, txs: 40, baseline: 400 },
  ],
}

console.log('\nparseAnomalies')

test('parses a valid snapshot', () => {
  const snap = parseAnomalies(validSnap)
  assert.ok(snap)
  assert.equal(snap.network, 'testnet')
  assert.equal(snap.status, 'ok')
  assert.equal(snap.items.length, 2)
  assert.equal(snap.items[0].app, 'usdc')
  assert.equal(snap.items[0].kind, 'spike')
  assert.equal(snap.items[0].ratio, 2.5)
})

test('returns null for null', () => {
  assert.equal(parseAnomalies(null), null)
})

test('returns null for non-object', () => {
  assert.equal(parseAnomalies('string'), null)
  assert.equal(parseAnomalies(42), null)
  assert.equal(parseAnomalies([]), null)
})

test('returns null for missing network', () => {
  assert.equal(parseAnomalies({ ...validSnap, network: undefined }), null)
})

test('returns null for invalid network', () => {
  assert.equal(parseAnomalies({ ...validSnap, network: 'Arc' }), null)
})

test('returns null for missing generatedAt', () => {
  assert.equal(parseAnomalies({ ...validSnap, generatedAt: '' }), null)
})

test('returns null for invalid status', () => {
  assert.equal(parseAnomalies({ ...validSnap, status: 'ready' }), null)
})

test('returns null when items is not an array', () => {
  assert.equal(parseAnomalies({ ...validSnap, items: {} }), null)
})

test('ignores items with unknown kind', () => {
  const snap = parseAnomalies({
    ...validSnap,
    items: [
      { app: 'usdc', kind: 'unknown', ratio: 2.5, txs: 1000, baseline: 400 },
      { app: 'eurc', kind: 'spike', ratio: 1.5, txs: 500, baseline: 333 },
    ],
  })
  assert.ok(snap)
  assert.equal(snap.items.length, 1)
  assert.equal(snap.items[0].app, 'eurc')
})

test('caps at 5 items', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    app: `app${i}`, kind: 'spike', ratio: 1.5, txs: 100, baseline: 66,
  }))
  const snap = parseAnomalies({ ...validSnap, items })
  assert.ok(snap)
  assert.equal(snap.items.length, 5)
})

test('clamps absurd ratio to 1000', () => {
  const snap = parseAnomalies({
    ...validSnap,
    items: [{ app: 'usdc', kind: 'spike', ratio: 99999, txs: 1000, baseline: 1 }],
  })
  assert.ok(snap)
  assert.equal(snap.items[0].ratio, 1000)
})

test('accepts warming-up status', () => {
  const snap = parseAnomalies({ ...validSnap, status: 'warming-up' })
  assert.ok(snap)
  assert.equal(snap.status, 'warming-up')
})

test('accepts stale status', () => {
  const snap = parseAnomalies({ ...validSnap, status: 'stale' })
  assert.ok(snap)
  assert.equal(snap.status, 'stale')
})

console.log('\nisAnomaliesFresh')

test('fresh ok snap → true', () => {
  const snap = parseAnomalies(validSnap)!
  assert.equal(isAnomaliesFresh(snap, now), true)
})

test('stale ok snap → false', () => {
  const snap = parseAnomalies({ ...validSnap, generatedAt: staleTs })!
  assert.equal(isAnomaliesFresh(snap, now), false)
})

test('warming-up snap → false even if fresh', () => {
  const snap = parseAnomalies({ ...validSnap, status: 'warming-up' })!
  assert.equal(isAnomaliesFresh(snap, now), false)
})

test('null → false', () => {
  assert.equal(isAnomaliesFresh(null, now), false)
})

console.log('\ndescribeAnomaly')

test('spike: formats multiplier with one decimal', () => {
  const item = { app: 'usdc', kind: 'spike' as const, ratio: 2.5, txs: 1000, baseline: 400 }
  assert.equal(describeAnomaly(item, 'USDC'), 'USDC: 2.5x its usual activity')
})

test('spike: rounds to one decimal', () => {
  const item = { app: 'usdc', kind: 'spike' as const, ratio: 3.15, txs: 1000, baseline: 400 }
  // Math.round(3.15 * 10) / 10 = 3.2
  assert.equal(describeAnomaly(item, 'USDC'), 'USDC: 3.2x its usual activity')
})

test('drop: computes correct percent', () => {
  const item = { app: 'eurc', kind: 'drop' as const, ratio: 0.1, txs: 40, baseline: 400 }
  assert.equal(describeAnomaly(item, 'EURC'), 'EURC: down 90% vs usual')
})

test('drop: ratio 0.5 → down 50%', () => {
  const item = { app: 'eurc', kind: 'drop' as const, ratio: 0.5, txs: 200, baseline: 400 }
  assert.equal(describeAnomaly(item, 'EURC'), 'EURC: down 50% vs usual')
})

test('uses provided appName (unknown id as-is)', () => {
  const item = { app: 'unknownapp', kind: 'spike' as const, ratio: 2.0, txs: 200, baseline: 100 }
  assert.equal(describeAnomaly(item, 'unknownapp'), 'unknownapp: 2x its usual activity')
})

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
