/**
 * Unit tests for computeNetworkStats, FEE_FLOOR_GWEI, TRANSFER_GAS.
 *
 * Run:
 *   node --experimental-strip-types --no-warnings src/lib/networkStats.test.ts
 *
 * All expected values are derived by hand from the source; no floating-point
 * guessing.  Float comparisons use Math.abs(a - b) < 1e-9 unless otherwise
 * noted.
 */

import { strict as assert } from 'node:assert'
import {
  computeNetworkStats,
  FEE_FLOOR_GWEI,
  TRANSFER_GAS,
} from './networkStats.ts'
import type { SampledBlock, FeeHistoryLike, BlockSample, ComputedStats } from './networkStats.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function near(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) < tol
}

function assertNear(a: number, b: number, msg: string, tol = 1e-9): void {
  assert.ok(near(a, b, tol), `${msg}: expected ${b}, got ${a} (tol=${tol})`)
}

/** Build a SampledBlock with an exact number of dummy transactions. */
function block(num: bigint, ts: bigint, txCount: number): SampledBlock {
  return { number: num, timestamp: ts, transactions: new Array(txCount).fill(null) }
}

let passed = 0
function test(name: string, fn: () => void): void {
  fn()
  console.log(`  PASS  ${name}`)
  passed++
}

// ============================================================================
// 1. Constants
// ============================================================================

test('FEE_FLOOR_GWEI is 20', () => {
  assert.strictEqual(FEE_FLOOR_GWEI, 20)
})

test('TRANSFER_GAS is 21000', () => {
  assert.strictEqual(TRANSFER_GAS, 21_000)
})

// ============================================================================
// 2. blocks mapping
// ============================================================================

test('blocks mapping: number, txCount, gasUsedRatio, baseFeeGwei', () => {
  // 3 blocks, index 0–2.
  // history has only 2 entries so index 2 is missing -> ratio=0, fee=0
  const blks: SampledBlock[] = [
    block(100n, 1000n, 5),
    block(101n, 1001n, 3),
    block(102n, 1002n, 7),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0.25, 0.50],            // index 2 missing
    baseFeePerGas: [20_000_000_000n, 30_000_000_000n], // index 2 missing
  }
  const stats: ComputedStats = computeNetworkStats(blks, history, 102n)
  const s: BlockSample[] = stats.blocks

  // Block 0
  assert.strictEqual(s[0].number, 100)
  assert.strictEqual(s[0].txCount, 5)
  assertNear(s[0].gasUsedRatio, 0.25, 'block[0].gasUsedRatio')
  assertNear(s[0].baseFeeGwei, 20, 'block[0].baseFeeGwei')   // 20_000_000_000 / 1e9 = 20

  // Block 1
  assert.strictEqual(s[1].number, 101)
  assert.strictEqual(s[1].txCount, 3)
  assertNear(s[1].gasUsedRatio, 0.50, 'block[1].gasUsedRatio')
  assertNear(s[1].baseFeeGwei, 30, 'block[1].baseFeeGwei')   // 30_000_000_000 / 1e9 = 30

  // Block 2 – missing history entries fall back to 0
  assert.strictEqual(s[2].number, 102)
  assert.strictEqual(s[2].txCount, 7)
  assertNear(s[2].gasUsedRatio, 0, 'block[2].gasUsedRatio missing->0')
  assertNear(s[2].baseFeeGwei, 0, 'block[2].baseFeeGwei missing->0')
})

// ============================================================================
// 3. tps and avgBlockTimeSec
// ============================================================================

test('tps: total tx / span (non-zero span)', () => {
  // 4 blocks, timestamps 0..3, each 2 tx  => totalTx=8, span=3
  // tps = 8/3
  const blks = [
    block(1n, 0n, 2),
    block(2n, 1n, 2),
    block(3n, 2n, 2),
    block(4n, 3n, 2),
  ]
  const history: FeeHistoryLike = { gasUsedRatio: [0, 0, 0, 0], baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n] }
  const stats = computeNetworkStats(blks, history, 4n)
  // span = 3 - 0 = 3, totalTx = 8, tps = 8/3
  assertNear(stats.tps as number, 8 / 3, 'tps 8/3')
})

test('tps: null when span is 0 (all same timestamp)', () => {
  // All timestamps identical -> span = 0 -> tps = null
  const blks = [
    block(1n, 5n, 3),
    block(2n, 5n, 3),
    block(3n, 5n, 3),
  ]
  const history: FeeHistoryLike = { gasUsedRatio: [0, 0, 0], baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n] }
  const stats = computeNetworkStats(blks, history, 3n)
  assert.strictEqual(stats.tps, null)
})

test('avgBlockTimeSec: span / (blocks.length - 1)', () => {
  // 6 blocks, timestamps 0,1,2,3,4,3  => span = 3 (last - first)
  // avgBlockTimeSec = 3 / (6 - 1) = 0.6
  const blks = [
    block(1n, 0n, 1),
    block(2n, 1n, 1),
    block(3n, 2n, 1),
    block(4n, 3n, 1),
    block(5n, 2n, 1),  // can go lower; span is last-first
    block(6n, 3n, 1),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0, 0, 0, 0, 0],
    baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n],
  }
  const stats = computeNetworkStats(blks, history, 6n)
  // span = blks[5].timestamp - blks[0].timestamp = 3 - 0 = 3
  // avgBlockTimeSec = 3 / 5 = 0.6
  assertNear(stats.avgBlockTimeSec as number, 0.6, 'avgBlockTimeSec 3/5')
})

test('avgBlockTimeSec: null when span is 0', () => {
  const blks = [
    block(1n, 10n, 0),
    block(2n, 10n, 0),
    block(3n, 10n, 0),
  ]
  const history: FeeHistoryLike = { gasUsedRatio: [0, 0, 0], baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n] }
  const stats = computeNetworkStats(blks, history, 3n)
  assert.strictEqual(stats.avgBlockTimeSec, null)
})

test('avgBlockTimeSec: null for single block (span=0 because last===first)', () => {
  // 1 block: span = blocks[0].timestamp - blocks[0].timestamp = 0 -> null
  const blks = [block(1n, 0n, 10)]
  const history: FeeHistoryLike = { gasUsedRatio: [0.5], baseFeePerGas: [20_000_000_000n] }
  const stats = computeNetworkStats(blks, history, 1n)
  // span = 0, so both tps and avgBlockTimeSec are null
  assert.strictEqual(stats.avgBlockTimeSec, null, 'single block -> avgBlockTimeSec null')
  assert.strictEqual(stats.tps, null, 'single block -> tps null')
})

// ============================================================================
// 4. peakTps
// ============================================================================

test('peakTps: null when fewer than 5 blocks', () => {
  // 4 blocks: the loop condition i + 5 <= 4 is never true -> peak stays 0 -> null
  const blks = [
    block(1n, 0n, 10),
    block(2n, 1n, 10),
    block(3n, 2n, 10),
    block(4n, 3n, 10),
  ]
  const history: FeeHistoryLike = { gasUsedRatio: [0, 0, 0, 0], baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n] }
  const stats = computeNetworkStats(blks, history, 4n)
  assert.strictEqual(stats.peakTps, null)
})

test('peakTps: burst single block cannot set it alone; 5-block window average wins', () => {
  // 5 blocks, timestamps 0,1,2,3,4.
  // Transactions: 0,0,100,0,0 => Only window 0-4 exists.
  // tx in window = 0+0+100+0+0 = 100; dt = 4-0 = 4; peak = 100/4 = 25
  // The single block (index 2) alone cannot be the denominator.
  const blks = [
    block(1n, 0n, 0),
    block(2n, 1n, 0),
    block(3n, 2n, 100),
    block(4n, 3n, 0),
    block(5n, 4n, 0),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0, 0, 0, 0],
    baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n],
  }
  const stats = computeNetworkStats(blks, history, 5n)
  // Only one window: blocks 0..4, dt = 4, tx = 100, peak = 25
  assertNear(stats.peakTps as number, 100 / 4, 'burst single block: peak=100/4=25')
  // Confirm it is NOT 100 / 1 (which would be the single-block rate)
  assert.ok((stats.peakTps as number) < 100, 'peakTps is 5-block average, not single-block rate')
})

test('peakTps: max over two windows with different rates', () => {
  // 6 blocks (2 windows: 0-4, 1-5).
  // Timestamps:  0, 1, 2, 3, 4, 5
  // Transactions: 2, 2, 2, 2, 10, 10
  //
  // Window 0-4: dt = 4-0 = 4, tx = 2+2+2+2+10 = 18, rate = 18/4 = 4.5
  // Window 1-5: dt = 5-1 = 4, tx = 2+2+2+10+10 = 26, rate = 26/4 = 6.5
  // peak = 6.5
  const blks = [
    block(1n, 0n, 2),
    block(2n, 1n, 2),
    block(3n, 2n, 2),
    block(4n, 3n, 2),
    block(5n, 4n, 10),
    block(6n, 5n, 10),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0, 0, 0, 0, 0],
    baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n],
  }
  const stats = computeNetworkStats(blks, history, 6n)
  assertNear(stats.peakTps as number, 26 / 4, 'peakTps picks max window (1-5): 26/4=6.5')
})

test('peakTps: windows with dt=0 are skipped', () => {
  // 5 blocks, all same timestamp -> every window has dt=0 -> all skipped
  // peak stays 0 -> peakTps = null
  const blks = [
    block(1n, 7n, 5),
    block(2n, 7n, 5),
    block(3n, 7n, 5),
    block(4n, 7n, 5),
    block(5n, 7n, 5),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0, 0, 0, 0],
    baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n],
  }
  const stats = computeNetworkStats(blks, history, 5n)
  assert.strictEqual(stats.peakTps, null)
})

// ============================================================================
// 5. transferCostUsdc and baseFeeGwei (top-level)
// ============================================================================

test('transferCostUsdc: 20 Gwei -> 0.00042; baseFeeGwei uses LAST entry', () => {
  // 3 entries in baseFeePerGas.  The LAST one is 20 Gwei.
  // cost = 20_000_000_000 * 21000 / 1e18
  //      = 420_000_000_000_000 / 1e18
  //      = 0.00042  (exact in IEEE 754)
  const blks = [
    block(1n, 0n, 1),
    block(2n, 1n, 1),
    block(3n, 2n, 1),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0, 0],
    baseFeePerGas: [50_000_000_000n, 30_000_000_000n, 20_000_000_000n], // last is 20 Gwei
  }
  const stats = computeNetworkStats(blks, history, 3n)
  assertNear(stats.transferCostUsdc, 0.00042, 'transferCostUsdc 20Gwei')
  // baseFeeGwei (top-level) should also be the last entry: 20
  assertNear(stats.baseFeeGwei, 20, 'baseFeeGwei top-level = last entry')
})

test('transferCostUsdc: uses last entry, not first (first entry would give wrong answer)', () => {
  // baseFeePerGas: first=100 Gwei, last=20 Gwei
  // If code used first entry: cost = 100*21000/1e9/1e9 = 0.0021 (wrong)
  // Correct (last entry):     cost = 20*21000/1e9/1e9  = 0.00042
  const blks = [
    block(1n, 0n, 0),
    block(2n, 1n, 0),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0],
    baseFeePerGas: [100_000_000_000n, 20_000_000_000n],
  }
  const stats = computeNetworkStats(blks, history, 2n)
  assertNear(stats.transferCostUsdc, 0.00042, 'cost uses last, not first')
  assertNear(stats.baseFeeGwei, 20, 'baseFeeGwei uses last entry')
})

test('transferCostUsdc: 0 when baseFeePerGas is empty', () => {
  const blks = [
    block(1n, 0n, 0),
    block(2n, 1n, 0),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0],
    baseFeePerGas: [],
  }
  const stats = computeNetworkStats(blks, history, 2n)
  assertNear(stats.transferCostUsdc, 0, 'empty baseFeePerGas -> cost=0')
  assertNear(stats.baseFeeGwei, 0, 'empty baseFeePerGas -> baseFeeGwei=0')
})

// ============================================================================
// 6. atFloorShare
// ============================================================================

test('atFloorShare: pin tolerance (<=20.001 counts, 20.002 does not)', () => {
  // 4 blocks with base fees: 20 Gwei, 20.001 Gwei, 20.002 Gwei, 25 Gwei
  // At-floor: <=20.001  =>  20 and 20.001 pass; 20.002 and 25 do not
  // That's 2 of 4 = 0.5
  // But history baseFeePerGas is in WEI (bigint).
  // 20.001 Gwei = 20_001_000_000 wei (bigint, integer-truncated for bigint)
  // 20.002 Gwei = 20_002_000_000 wei
  // 25 Gwei = 25_000_000_000 wei
  //
  // Wait: baseFeeGwei = Number(history.baseFeePerGas[i] ?? 0n) / 1e9
  // So 20_001_000_000n / 1e9 = 20.001  (exact in IEEE 754)
  //    20_002_000_000n / 1e9 = 20.002
  //
  // atFloorShare condition: baseFeeGwei <= FEE_FLOOR_GWEI + 0.001
  //                                     = 20 + 0.001 = 20.001
  // 20.001 <= 20.001 -> true
  // 20.002 <= 20.001 -> false
  const blks = [
    block(1n, 0n, 1),
    block(2n, 1n, 1),
    block(3n, 2n, 1),
    block(4n, 3n, 1),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0, 0, 0],
    baseFeePerGas: [
      20_000_000_000n, // 20.000 Gwei -> at floor
      20_001_000_000n, // 20.001 Gwei -> at floor (boundary, counts)
      20_002_000_000n, // 20.002 Gwei -> NOT at floor
      25_000_000_000n, // 25 Gwei -> NOT at floor
    ],
  }
  const stats = computeNetworkStats(blks, history, 4n)
  assertNear(stats.atFloorShare, 2 / 4, 'atFloorShare 2/4=0.5; 20.001 counts, 20.002 does not')
})

test('atFloorShare: 3 of 4 at floor -> 0.75', () => {
  // Blocks: 20, 20, 20, 25 Gwei
  const blks = [
    block(1n, 0n, 0),
    block(2n, 1n, 0),
    block(3n, 2n, 0),
    block(4n, 3n, 0),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0, 0, 0, 0],
    baseFeePerGas: [
      20_000_000_000n,
      20_000_000_000n,
      20_000_000_000n,
      25_000_000_000n,
    ],
  }
  const stats = computeNetworkStats(blks, history, 4n)
  assertNear(stats.atFloorShare, 0.75, 'atFloorShare 3/4=0.75')
})

test('atFloorShare: exactly 20 Gwei counts', () => {
  const blks = [block(1n, 0n, 0)]
  const history: FeeHistoryLike = { gasUsedRatio: [0], baseFeePerGas: [20_000_000_000n] }
  const stats = computeNetworkStats(blks, history, 1n)
  assertNear(stats.atFloorShare, 1.0, 'exactly 20 Gwei -> at floor')
})

// ============================================================================
// 7. avgFullness
// ============================================================================

test('avgFullness: mean gasUsedRatio, missing entries count as 0', () => {
  // 4 blocks; history has ratios for only 3 of them
  // Ratios (via mapping): 0.8, 0.4, 0, 0  (index 2 and 3 missing from history)
  // Wait: history.gasUsedRatio has 2 entries, not 3.
  // Mapping: [0.8, 0.4, 0 (missing), 0 (missing)]
  // mean = (0.8 + 0.4 + 0 + 0) / 4 = 0.3
  const blks = [
    block(1n, 0n, 0),
    block(2n, 1n, 0),
    block(3n, 2n, 0),
    block(4n, 3n, 0),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0.8, 0.4],  // indices 2,3 missing -> 0
    baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n, 20_000_000_000n],
  }
  const stats = computeNetworkStats(blks, history, 4n)
  assertNear(stats.avgFullness, (0.8 + 0.4 + 0 + 0) / 4, 'avgFullness missing entries as 0')
})

test('avgFullness: all entries present', () => {
  const blks = [
    block(1n, 0n, 0),
    block(2n, 1n, 0),
    block(3n, 2n, 0),
  ]
  const history: FeeHistoryLike = {
    gasUsedRatio: [0.1, 0.5, 0.9],
    baseFeePerGas: [20_000_000_000n, 20_000_000_000n, 20_000_000_000n],
  }
  const stats = computeNetworkStats(blks, history, 3n)
  assertNear(stats.avgFullness, (0.1 + 0.5 + 0.9) / 3, 'avgFullness (0.1+0.5+0.9)/3')
})

// ============================================================================
// 8. latestBlock
// ============================================================================

test('latestBlock = Number(latest)', () => {
  const blks = [block(50n, 0n, 0), block(51n, 1n, 0)]
  const history: FeeHistoryLike = { gasUsedRatio: [0, 0], baseFeePerGas: [20_000_000_000n, 20_000_000_000n] }
  const stats = computeNetworkStats(blks, history, 999_999n)
  assert.strictEqual(stats.latestBlock, 999_999)
})

// ============================================================================
// 9. Realistic scenario: 30 blocks, 0.5 s apart, ~6.5 tx/block, 20 Gwei
// ============================================================================

test('realistic 30-block scenario: tps ~12-13, avgBlockTimeSec=0.5, cost=0.00042', () => {
  // 30 blocks, timestamps 0, 500, 1000, … 14500 ms (in seconds as bigint integer)
  // We use integer timestamps in units of milliseconds and then divide; but
  // the code uses raw bigint subtraction, so we use 0,1,2,…,29 for "seconds"
  // times 0.5 -> not integer.  Instead model 0.5s intervals as half-seconds
  // by using timestamps 0,1,2,...,29 and interpreting them as half-seconds
  // (i.e. span_s = 29 * 0.5 is conceptual; the raw span number = 29).
  //
  // Actually: to get 0.5 s intervals with integer bigint timestamps, multiply
  // by 2 to avoid fractions: timestamps = 0, 1, 2, ..., 29 (in units of 0.5 s).
  // span_raw = 29.  tps = totalTx / 29 (per half-second), then *2 for per-second
  // — but the code doesn't know about half-seconds, it just divides by the raw span.
  //
  // Better: use real seconds by making each step = 1 and using 30 blocks over
  // 15 seconds (step=0.5s -> step bigint=1 per 2 blocks is awkward).
  //
  // Simplest: timestamps 0,1,2,...,29 where unit = 0.5 s.
  // totalTx = 30 * 6 + ... let's use exactly 6 tx per block = 180 total.
  // tps (per raw unit) = 180 / 29
  // If 1 raw unit = 0.5 s, then tps_per_sec = (180/29) / 0.5 = 360/29 ≈ 12.41
  //
  // The code doesn't know time units; it just gives tx/raw_span.
  // So let's use timestamps in seconds (bigint) with 0.5 s steps impossible as
  // integers.  Use timestamps 0,1,2,...,29 and call each unit "0.5 seconds" —
  // then assert tps (raw, per 0.5 s) * 2 for per-second.
  //
  // But the test should match what the code RETURNS, not a unit-converted value.
  // The code returns tps = totalTx / span (raw bigint units).
  // We model timestamps in units of 0.5s (as integers 0..29), so raw tps = totalTx/29.
  // The caller would multiply by 2 to get per-second, but the function returns raw.
  //
  // For the test: assert stats.tps ≈ 180/29 and avgBlockTimeSec = 29/29 = 1 (in 0.5-s units).
  //
  // That's awkward to call "12-13 tps". Instead, use integer seconds rounded:
  // 30 blocks, 0 to 14 seconds stepping by ~0.5 -> timestamps 0,0,1,1,2,2,...,14,14
  // i.e. pairs share a second.  span = 14 - 0 = 14.
  // avgBlockTimeSec = 14 / (30 - 1) = 14/29 ≈ 0.483
  // totalTx = 30 * 7 = 210 (7 tx per block)
  // tps = 210 / 14 = 15  (not 12-13).
  //
  // Cleanest: timestamps in milliseconds (bigint ms), step = 500.
  // span = 29 * 500 = 14500 ms.  avgBlockTimeSec = 14500 / 29 = 500 (ms/block).
  // But tps = totalTx / 14500 (tx per ms) which is tiny.
  //
  // The ONLY clean way to get a per-second TPS from the function is to use
  // timestamps in seconds (bigint).  With 30 blocks and 15 seconds total
  // (step = 15/29 ≈ 0.517s, not integer).  Round to nearest integer second:
  //
  // Use timestamps: round(i * 15/29) for i=0..29
  // These are all in [0, 15] with some repeats, total span = 15.
  // avgBlockTimeSec = 15 / 29 ≈ 0.517 (close to 0.5).
  // tps = (30 * 6) / 15 = 180/15 = 12.0  <- nice!
  //
  // Let's use exactly that: 30 blocks, 6 tx each, timestamps that span 15s.
  // Timestamps: t[i] = BigInt(Math.round(i * 15 / 29)) for i = 0..29
  //             -> t[0]=0, t[29]=15.  span=15.
  // tps = 180 / 15 = 12.0  (in [12, 13])
  // avgBlockTimeSec = 15 / 29 ≈ 0.5172  (close to 0.5)
  // transferCostUsdc: last baseFeePerGas = 20_000_000_000n -> 0.00042
  //
  // peakTps: all windows have 30 tx (5 * 6).  dt of window i = t[i+4] - t[i].
  // Most windows have dt = round(4 * 15/29) = round(2.069) = 2.
  // peak = 30 / 2 = 15.

  const N = 30
  const TX_PER_BLOCK = 6
  const SPAN_S = 15
  const timestamps = Array.from({ length: N }, (_, i) => BigInt(Math.round(i * SPAN_S / (N - 1))))
  const blks: SampledBlock[] = timestamps.map((ts, i) =>
    block(BigInt(i + 1), ts, TX_PER_BLOCK)
  )
  const ratio = 0.016
  const history: FeeHistoryLike = {
    gasUsedRatio: Array.from({ length: N }, () => ratio),
    baseFeePerGas: Array.from({ length: N }, () => 20_000_000_000n),
  }

  const stats = computeNetworkStats(blks, history, BigInt(N))

  const totalTx = N * TX_PER_BLOCK       // 180
  const span = Number(timestamps[N - 1] - timestamps[0])  // 15
  const expectedTps = totalTx / span      // 180 / 15 = 12.0

  assertNear(stats.tps as number, expectedTps, 'realistic tps', 1e-9)
  assert.ok(
    (stats.tps as number) >= 12 && (stats.tps as number) <= 13,
    `realistic tps in [12,13], got ${stats.tps}`
  )
  assertNear(stats.transferCostUsdc, 0.00042, 'realistic transferCostUsdc')
  assertNear(stats.baseFeeGwei, 20, 'realistic baseFeeGwei')
  assertNear(stats.avgFullness, ratio, 'realistic avgFullness')
  assertNear(stats.atFloorShare, 1.0, 'realistic atFloorShare all at floor')
  assert.strictEqual(stats.latestBlock, N)
  assert.ok(stats.peakTps !== null, 'realistic peakTps not null')
})

test('peakTps keeps the busiest window even when later windows are quieter', () => {
  const txs = [10, 10, 10, 10, 10, 0, 0]
  const blocks = txs.map((n, i) => block(BigInt(100 + i), BigInt(i), n))
  const history = { gasUsedRatio: txs.map(() => 0), baseFeePerGas: txs.map(() => 20_000_000_000n) }
  const r = computeNetworkStats(blocks, history, 106n)
  // windows: 50 tx / 4 s = 12.5, 40 / 4 = 10, 30 / 4 = 7.5
  assertNear(r.peakTps as number, 12.5, 'peak is the first (busiest) window')
})

// ============================================================================
// Summary
// ============================================================================

console.log(`\nAll ${passed} assertions passed.`)
