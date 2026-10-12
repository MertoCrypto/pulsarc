/**
 * Tests for src/lib/walletDist.ts
 *
 * Run with:
 *   node --experimental-strip-types src/lib/walletDist.test.ts
 *
 * Uses only node:assert and node:fs — no test framework.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDist, percentileOf, describe } from './walletDist.ts'

// ── Load the real sample ───────────────────────────────────────────────────────

const samplePath =
  process.env['WALLET_DIST_SAMPLE'] ??
  'src/lib/fixtures/catalog/testnet-dist.json'

const rawSample: unknown = JSON.parse(readFileSync(samplePath, 'utf8'))
const dist = parseDist(rawSample)

// ── parseDist: accepts the real sample ───────────────────────────────────────

assert.ok(dist !== null, 'parseDist: should accept the real sample')
assert.equal(dist.walletCount, 38196, 'parseDist: walletCount should be 38196')
assert.equal(dist.net, 'testnet', 'parseDist: net should be testnet')
assert.equal(dist.through, 283, 'parseDist: through should be 283')

const txArr = dist.metrics['tx']
const adArr = dist.metrics['activeDays']
const usSentArr = dist.metrics['usdcSent']
const usRecvArr = dist.metrics['usdcReceived']

assert.ok(txArr !== undefined, 'parseDist: tx metric should be present')
assert.ok(adArr !== undefined, 'parseDist: activeDays metric should be present')
assert.ok(usSentArr !== undefined, 'parseDist: usdcSent metric should be present')
assert.ok(usRecvArr !== undefined, 'parseDist: usdcReceived metric should be present')

assert.equal(txArr.length, 101, 'parseDist: tx should have 101 entries')

// ── parseDist: rejects wrong length (100 entries) ────────────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  const bm = bad['metrics'] as Record<string, unknown>
  const shortArr = (bm['tx'] as number[]).slice(0, 100) // 100 elements
  bm['tx'] = shortArr
  const result = parseDist(bad)
  // tx is dropped; other 3 metrics survive, so result is non-null but tx is absent
  assert.ok(result !== null, 'parseDist: drops bad-length metric, keeps rest')
  assert.equal(result.metrics['tx'], undefined, 'parseDist: tx should be dropped when length is 100')
  assert.ok(result.metrics['activeDays'] !== undefined, 'parseDist: activeDays survives when tx is dropped')
}

// ── parseDist: rejects wrong length (102 entries) ────────────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  const bm = bad['metrics'] as Record<string, unknown>
  const longArr = [...(bm['tx'] as number[]), 9999] // 102 elements
  bm['tx'] = longArr
  const result = parseDist(bad)
  assert.ok(result !== null, 'parseDist: drops 102-length metric, keeps rest')
  assert.equal(result.metrics['tx'], undefined, 'parseDist: tx should be dropped when length is 102')
}

// ── parseDist: rejects unsorted metric ───────────────────────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  const bm = bad['metrics'] as Record<string, unknown>
  const unsorted = [...(bm['tx'] as number[])]
  // Swap two adjacent elements to create a decrease
  ;[unsorted[10], unsorted[11]] = [unsorted[11], unsorted[10]]
  bm['tx'] = unsorted
  const result = parseDist(bad)
  assert.ok(result !== null, 'parseDist: drops unsorted metric, keeps rest')
  assert.equal(result.metrics['tx'], undefined, 'parseDist: tx should be dropped when unsorted')
}

// ── parseDist: rejects NaN in metric ─────────────────────────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  const bm = bad['metrics'] as Record<string, unknown>
  const withNan = [...(bm['tx'] as number[])]
  withNan[50] = NaN
  bm['tx'] = withNan
  const result = parseDist(bad)
  assert.ok(result !== null, 'parseDist: drops NaN metric, keeps rest')
  assert.equal(result.metrics['tx'], undefined, 'parseDist: tx should be dropped when it contains NaN')
}

// ── parseDist: rejects missing walletCount ────────────────────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  delete bad['walletCount']
  const result = parseDist(bad)
  assert.equal(result, null, 'parseDist: should return null when walletCount is missing')
}

// ── parseDist: rejects walletCount < 1 ────────────────────────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  bad['walletCount'] = 0
  const result = parseDist(bad)
  assert.equal(result, null, 'parseDist: should return null when walletCount is 0')
}

// ── parseDist: rejects non-object ─────────────────────────────────────────────

assert.equal(parseDist(null), null, 'parseDist: null -> null')
assert.equal(parseDist(42), null, 'parseDist: number -> null')
assert.equal(parseDist([]), null, 'parseDist: array -> null')
assert.equal(parseDist('string'), null, 'parseDist: string -> null')

// ── parseDist: drops one bad metric, keeps others ────────────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  const bm = bad['metrics'] as Record<string, unknown>
  // Make usdcSent a 100-element array (bad)
  bm['usdcSent'] = (bm['usdcSent'] as number[]).slice(0, 100)
  const result = parseDist(bad)
  assert.ok(result !== null, 'parseDist: result is non-null when one metric is bad')
  assert.equal(result.metrics['usdcSent'], undefined, 'parseDist: bad usdcSent is dropped')
  assert.ok(result.metrics['tx'] !== undefined, 'parseDist: tx survives when usdcSent is dropped')
  assert.ok(result.metrics['activeDays'] !== undefined, 'parseDist: activeDays survives when usdcSent is dropped')
  assert.ok(result.metrics['usdcReceived'] !== undefined, 'parseDist: usdcReceived survives when usdcSent is dropped')
}

// ── parseDist: returns null when all metrics are invalid ─────────────────────

{
  const bad = JSON.parse(JSON.stringify(rawSample)) as Record<string, unknown>
  bad['metrics'] = {}
  const result = parseDist(bad)
  assert.equal(result, null, 'parseDist: should return null when metrics object has no valid entries')
}

// ── percentileOf: value below q[0] → 0 ───────────────────────────────────────

// tx q[0] = 0; a value strictly less than all boundaries
// For value = -1: below = 0 → Math.min(100, Math.max(0, -1)) = 0
assert.equal(percentileOf(txArr, -1), 0, 'percentileOf: value below q[0] -> 0')

// ── percentileOf: value above q[100] → 100 ───────────────────────────────────

// tx q[100] = 4967; value strictly above all boundaries
// below = 101 → Math.min(100, Math.max(0, 101-1)) = 100
assert.equal(percentileOf(txArr, 99999), 100, 'percentileOf: value above q[100] -> 100')

// ── percentileOf: monotonic non-decreasing over 200 sweep values ──────────────

{
  // Use usdcSent for an interesting range
  const q = usSentArr
  const minVal = q[0]
  const maxVal = q[100]
  const step = (maxVal - minVal) / 199
  let prev = -1
  for (let i = 0; i < 200; i++) {
    const v = minVal + i * step
    const p = percentileOf(q, v)
    assert.ok(
      p >= prev,
      `percentileOf: monotonicity violated at i=${i}, v=${v}, p=${p}, prev=${prev}`,
    )
    prev = p
  }
}

// ── percentileOf: 3 hand-computed cases from the real tx array ───────────────

// tx array (indices 0-100):
// [0,0,0,0,0,0,0,0,0,0,0,  <- indices 0-10 (11 zeros)
//  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,  <- indices 11-53 (43 ones)
//  2,2,2,2,2,2,2,2,2,2,2,  <- indices 54-64 (11 twos)
//  3,3,3,3,3,3,3,3,3,3,3,  <- indices 65-75 (11 threes)
//  4,4,4,4,4,4,             <- indices 76-81 (6 fours)
//  5,5,5,5,5,               <- indices 82-86 (5 fives)
//  6,6,6,6,6,               <- indices 87-91 (5 sixes)
//  7,7,                     <- indices 92-93
//  8,8,                     <- indices 94-95
//  10, 13, 20, 31, 4967]   <- indices 96-100

// Case 1: value = 0
// boundaries strictly < 0: none → below = 0 → Math.max(0, 0-1) = 0
{
  const expected = (() => {
    let below = 0
    for (const v of txArr) { if (v < 0) below++ }
    return Math.min(100, Math.max(0, below - 1))
  })()
  assert.equal(percentileOf(txArr, 0), expected, 'percentileOf(tx, 0): hand-computed')
}

// Case 2: value = 2
// boundaries strictly < 2: q[0..10]=0 (11) + q[11..53]=1 (43) = 54 boundaries
// → Math.min(100, Math.max(0, 54-1)) = 53
{
  const expected = (() => {
    let below = 0
    for (const v of txArr) { if (v < 2) below++ }
    return Math.min(100, Math.max(0, below - 1))
  })()
  assert.equal(percentileOf(txArr, 2), expected, 'percentileOf(tx, 2): hand-computed')
  assert.equal(expected, 53, 'percentileOf(tx, 2): expected 53')
}

// Case 3: value = 5
// boundaries strictly < 5: q[0..10]=0(11) + q[11..53]=1(43) + q[54..64]=2(11) + q[65..75]=3(11) + q[76..81]=4(6) = 82
// → Math.min(100, Math.max(0, 82-1)) = 81
{
  const expected = (() => {
    let below = 0
    for (const v of txArr) { if (v < 5) below++ }
    return Math.min(100, Math.max(0, below - 1))
  })()
  assert.equal(percentileOf(txArr, 5), expected, 'percentileOf(tx, 5): hand-computed')
  assert.equal(expected, 81, 'percentileOf(tx, 5): expected 81')
}

// ── describe: skips tx when partial is true ───────────────────────────────────

{
  const lines = describe(dist, {
    activeDays: 5,
    tx: 3,
    usdcSent: 10,
    usdcReceived: 5,
    partial: true,
  })
  const labels = lines.map(l => l.label)
  assert.ok(!labels.includes('Transactions sent'), 'describe: skips tx when partial=true')
  // the real testnet sample has one indexed day, so activeDays has no spread and is skipped
  assert.ok(!labels.includes('Active days'), 'describe: no spread -> activeDays line skipped')
  assert.ok(labels.includes('USDC sent'), 'describe: still shows metrics that have spread when partial=true')
}

// ── describe: includes tx when partial is false ───────────────────────────────

{
  const lines = describe(dist, {
    activeDays: 5,
    tx: 3,
    usdcSent: 10,
    usdcReceived: 5,
    partial: false,
  })
  const labels = lines.map(l => l.label)
  assert.ok(labels.includes('Transactions sent'), 'describe: includes tx when partial=false')
}

// ── describe: correct order of lines ─────────────────────────────────────────

{
  // give every metric some spread so none is skipped (the real testnet sample has a flat activeDays)
  const spread = Array.from({ length: 101 }, (_, i) => i)
  const d2 = parseDist({ net: 'testnet', through: 5, walletCount: 10, metrics: { activeDays: spread, tx: spread, usdcSent: spread, usdcReceived: spread } })
  assert.ok(d2)
  const lines = describe(d2!, {
    activeDays: 5,
    tx: 3,
    usdcSent: 10,
    usdcReceived: 5,
    partial: false,
  })
  const labels = lines.map(l => l.label)
  assert.deepEqual(
    labels,
    ['Transactions sent', 'Active days', 'USDC sent', 'USDC received'],
    'describe: lines are in order tx, activeDays, usdcSent, usdcReceived',
  )
}

// ── describe: text contains the grouped walletCount ──────────────────────────

{
  const lines = describe(dist, {
    activeDays: 5,
    tx: 3,
    usdcSent: 10,
    usdcReceived: 5,
    partial: false,
  })
  const n = new Intl.NumberFormat('en-US').format(38196) // "38,196"
  for (const line of lines) {
    assert.ok(
      line.text.includes(n),
      `describe: text "${line.text}" should contain grouped walletCount "${n}"`,
    )
  }
}

// ── describe: p < 1 uses "Fewer than 1%" wording ─────────────────────────────

{
  // tx has spread in the sample; value 0 gives below=0 → p=0 (<1)
  const lines = describe(dist, {
    activeDays: 0,
    tx: 0,
    usdcSent: 0,
    usdcReceived: 0,
    partial: false,
  })
  const adLine = lines.find(l => l.label === 'Transactions sent')
  assert.ok(adLine !== undefined, 'describe: tx line should exist for value 0')
  assert.ok(
    adLine.text.startsWith('Fewer than 1%'),
    `describe: low percentile should use "Fewer than 1%" wording, got: "${adLine.text}"`,
  )
}

// ── describe: p >= 1 uses "More than X%" wording ─────────────────────────────

{
  // tx = 5 → p = 81 (verified above)
  const lines = describe(dist, {
    activeDays: 1,
    tx: 5,
    usdcSent: 0,
    usdcReceived: 0,
    partial: false,
  })
  const txLine = lines.find(l => l.label === 'Transactions sent')
  assert.ok(txLine !== undefined, 'describe: tx line should exist')
  assert.ok(
    txLine.text.startsWith('More than'),
    `describe: high percentile should use "More than" wording, got: "${txLine.text}"`,
  )
}

console.log('walletDist: all tests passed')

// describe skips metrics with no spread (min === max)
{
  const flat = Array(101).fill(1)
  const spread = Array.from({ length: 101 }, (_, i) => i)
  const d = parseDist({ net: 'testnet', through: 5, walletCount: 10, metrics: { activeDays: flat, tx: spread } })
  assert.ok(d)
  const lines = describe(d!, { activeDays: 1, tx: 50, usdcSent: 0, usdcReceived: 0, partial: false })
  assert.deepEqual(lines.map(l => l.label), ['Transactions sent'])
  console.log('describe: skips metrics without spread: OK')
}

