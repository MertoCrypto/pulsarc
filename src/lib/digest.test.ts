/**
 * Tests for src/lib/digest.ts
 * Run with: node --experimental-strip-types src/lib/digest.test.ts
 */
import assert from 'node:assert/strict'
import { parseDigest, progress, formatChange } from './digest.ts'

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

const validWarmingUp = {
  network: 'testnet',
  generatedAt: '2026-10-10T07:00:00.000Z',
  status: 'warming-up',
  readyAt: '2026-10-24T07:00:00.000Z',
  hoursHeld: 9,
  hoursNeeded: 336,
}

const validOk = {
  network: 'testnet',
  generatedAt: '2026-10-10T07:00:00.000Z',
  status: 'ok',
  from: '2026-10-03T00:00:00.000Z',
  to: '2026-10-10T00:00:00.000Z',
  network_txs: 5880,
  network_prev_txs: 5040,
  network_change: 17,
  growers: [{ app: 'usdc', label: 'USDC', txs: 3360, prevTxs: 1680, change: 100 }],
  fallers: [{ app: 'eurc', label: 'EURC', txs: 200, prevTxs: 400, change: -50 }],
  top: [{ app: 'usdc', label: 'USDC', txs: 3360, prevTxs: 1680, change: 100 }],
  shareText: 'Arc this week: 5.9K transactions (+17% vs last week). pulsarc.vercel.app',
}

console.log('\nparseDigest — warming-up')

test('parses warming-up snapshot', () => {
  const d = parseDigest(validWarmingUp)
  assert.ok(d)
  assert.equal(d.status, 'warming-up')
  assert.equal(d.network, 'testnet')
  assert.equal(d.hoursHeld, 9)
  assert.equal(d.hoursNeeded, 336)
  assert.equal(d.readyAt, '2026-10-24T07:00:00.000Z')
})

test('accepts null readyAt', () => {
  const d = parseDigest({ ...validWarmingUp, readyAt: null })
  assert.ok(d)
  assert.equal(d.status, 'warming-up')
  if (d.status === 'warming-up') assert.equal(d.readyAt, null)
})

test('returns null when hoursHeld missing', () => {
  assert.equal(parseDigest({ ...validWarmingUp, hoursHeld: undefined }), null)
})

console.log('\nparseDigest — ok')

test('parses ok snapshot', () => {
  const d = parseDigest(validOk)
  assert.ok(d)
  assert.equal(d.status, 'ok')
  if (d.status === 'ok') {
    assert.equal(d.network_txs, 5880)
    assert.equal(d.network_change, 17)
    assert.equal(d.growers.length, 1)
    assert.equal(d.growers[0].app, 'usdc')
    assert.equal(d.shareText, validOk.shareText)
  }
})

test('accepts null network_change', () => {
  const d = parseDigest({ ...validOk, network_change: null })
  assert.ok(d)
  if (d?.status === 'ok') assert.equal(d.network_change, null)
})

test('drops malformed grower items, keeps valid', () => {
  const d = parseDigest({
    ...validOk,
    growers: [
      { app: 'usdc', label: 'USDC', txs: 100, prevTxs: 50, change: 100 },
      { app: 'bad', label: 'Bad', txs: 'not a number', prevTxs: 50, change: 0 }, // invalid
    ],
  })
  assert.ok(d)
  if (d?.status === 'ok') assert.equal(d.growers.length, 1)
})

test('returns null when network is missing', () => {
  assert.equal(parseDigest({ ...validOk, network: undefined }), null)
})

test('returns null when status is unknown', () => {
  assert.equal(parseDigest({ ...validOk, status: 'stale' }), null)
})

test('returns null for null input', () => {
  assert.equal(parseDigest(null), null)
})

test('returns null for non-object', () => {
  assert.equal(parseDigest('string'), null)
  assert.equal(parseDigest(42), null)
})

test('returns null when from/to missing in ok', () => {
  assert.equal(parseDigest({ ...validOk, from: undefined }), null)
})

test('returns null when shareText missing in ok', () => {
  assert.equal(parseDigest({ ...validOk, shareText: undefined }), null)
})

console.log('\nprogress')

test('warming-up: computes percent correctly', () => {
  const d = parseDigest(validWarmingUp)!
  // 9/336 * 100 = 2.678... → round → 3
  assert.equal(progress(d), 3)
})

test('warming-up: clamps at 100', () => {
  const d = parseDigest({ ...validWarmingUp, hoursHeld: 500, hoursNeeded: 336 })!
  assert.equal(progress(d), 100)
})

test('ok status → 0', () => {
  const d = parseDigest(validOk)!
  assert.equal(progress(d), 0)
})

test('null → 0', () => {
  assert.equal(progress(null), 0)
})

test('hoursNeeded 0 → 100', () => {
  const d = parseDigest({ ...validWarmingUp, hoursHeld: 0, hoursNeeded: 0 })!
  assert.equal(progress(d), 100)
})

console.log('\nformatChange')

test('+17 → "+17%"', () => {
  assert.equal(formatChange(17), '+17%')
})

test('-8 → "-8%"', () => {
  assert.equal(formatChange(-8), '-8%')
})

test('0 → "+0%"', () => {
  assert.equal(formatChange(0), '+0%')
})

test('null → "—"', () => {
  assert.equal(formatChange(null), '—')
})

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
