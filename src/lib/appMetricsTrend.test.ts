/**
 * Unit tests for the trend calculation in computeMetrics.
 *
 * computeTrend is private; every assertion goes through computeMetrics(...).trend.
 *
 * Run:
 *   node --experimental-strip-types --no-warnings src/lib/appMetricsTrend.test.ts
 *
 * All expected values are derived from the source (appMetrics.ts) by hand before the
 * assertion is written.  No test is weakened to make it pass.
 *
 * Key invariant the code relies on: events inside an AnchorSample MUST be
 * newest-first so that  oldestOf(s) = s.events[s.events.length - 1].ts  is
 * genuinely the oldest timestamp.  Every sample below is built in that order.
 */

import assert from 'node:assert/strict'
import { computeMetrics } from './appMetrics.ts'
import type { AnchorSample, AppSample, ActivityEvent } from './appMetrics.ts'

// ── helpers ──────────────────────────────────────────────────────────────────

function event(ts: number, wallets: string[], usd: number | null = null, fee = 0): ActivityEvent {
  return { ts, wallets, usd, fee, hash: `0x${ts}` }
}

/** Sort events newest-first and wrap them in an AnchorSample.
 *  The Anchor type lives in @/data/apps (unresolved here); we construct the
 *  object as `unknown` and cast once so neither `any` assignment nor unsafe
 *  member access rules fire.  The shape { kind, usd } is everything
 *  computeMetrics reads from anchor. */
function makeAnchor(
  events: ActivityEvent[],
  hasMore = false,
  kind: 'contract' | 'token' = 'contract',
): AnchorSample {
  const sorted = [...events].sort((a, b) => b.ts - a.ts)
  const raw: unknown = { anchor: { kind, usd: false }, events: sorted, hasMore, balance: 0 }
  return raw as AnchorSample
}

function makeSample(anchors: AnchorSample[]): AppSample {
  return { appId: 'test', anchors, fetchedAt: 0 }
}

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  console.log(`  ✓ ${name}`)
  passed++
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Exact mode
//
// Setup (now=10_000_000, W=3_600_000):
//   cutAll  = now - W    = 6_400_000   (>= this → txNow)
//   cutPrev = now - 2*W  = 2_800_000   (>= this AND < cutAll → txPrev)
//
//   isComplete(s, cutPrev) = !hasMore || oldestOf(s) <= cutPrev
//   exact = anchors.every(s => isComplete(s, cutPrev))
//
//   With hasMore=false every anchor is complete → exact=true → approx=false.
//   The branch taken is: e.ts >= cutAll → txNow
//                        e.ts >= cutPrev (and < cutAll) → txPrev
//                        e.ts < cutPrev → neither
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. Exact mode')
{
  const now = 10_000_000
  const W1  = 3_600_000
  const cutAll  = now - W1      // 6_400_000
  const cutPrev = now - 2 * W1  // 2_800_000

  // e1: now-500k=9_500_000   ≥ cutAll               → txNow,  wallet A
  // e2: cutAll=6_400_000     ≥ cutAll (==)           → txNow,  wallet B
  // e3: cutAll-1=6_399_999   < cutAll, ≥ cutPrev     → txPrev, wallet C
  // e4: cutPrev=2_800_000    ≥ cutPrev (==)          → txPrev, wallet D
  // e5: cutPrev-1=2_799_999  < cutPrev               → neither, wallet E
  // e6: cutPrev-1_000_000    < cutPrev               → neither, wallet F
  const e1 = event(now - 500_000,        ['A'])
  const e2 = event(cutAll,               ['B'])
  const e3 = event(cutAll - 1,           ['C'])
  const e4 = event(cutPrev,              ['D'])
  const e5 = event(cutPrev - 1,          ['E'])
  const e6 = event(cutPrev - 1_000_000,  ['F'])

  // txNow=2, txPrev=2, total=4 < 6 → null
  const s1 = makeAnchor([e1, e2, e3, e4, e5, e6])
  const r1  = computeMetrics(makeSample([s1]), W1, now)

  test('exact mode, 4 qualifying events → trend null (< 6 threshold)', () => {
    assert.equal(r1.trend, null)
  })

  // Add e7 and e8 to push txNow from 2 → 4; total becomes 6.
  // e7: now-100k, wallets A (dup) + G → txNow; adds G to wNow (A already there)
  // e8: now-200k, wallet H             → txNow
  // txNow=4, txPrev=2, total=6 → not null
  // walletsNow: A(e1), B(e2), A(e7 dup), G(e7), H(e8) → distinct {A,B,G,H} = 4
  // walletsPrev: C(e3), D(e4)                          → distinct {C,D} = 2
  const e7 = event(now - 100_000, ['A', 'G'])
  const e8 = event(now - 200_000, ['H'])

  const s2 = makeAnchor([e1, e2, e3, e4, e5, e6, e7, e8])
  const r2  = computeMetrics(makeSample([s2]), W1, now)
  const t2  = r2.trend

  test('exact mode, txNow+txPrev=6 → trend not null (boundary)', () => {
    assert.notEqual(t2, null)
  })
  test('exact mode, txNow = 4', () => {
    assert.equal(t2!.txNow, 4)
  })
  test('exact mode, txPrev = 2', () => {
    assert.equal(t2!.txPrev, 2)
  })
  test('exact mode, walletsNow distinct = 4 (A,B,G,H)', () => {
    assert.equal(t2!.walletsNow, 4)
  })
  test('exact mode, walletsPrev distinct = 2 (C,D)', () => {
    assert.equal(t2!.walletsPrev, 2)
  })
  test('exact mode, approx = false', () => {
    assert.equal(t2!.approx, false)
  })

  // Boundary: e2.ts === cutAll counts as txNow (checked above implicitly).
  // Confirm explicitly: build a sample with only e2 + 5 more txNow events so
  // total ≥ 6; e2 must land in txNow, not txPrev.
  const onlyCutAll = makeAnchor([
    event(now - 100_000, ['X1']),
    event(now - 200_000, ['X2']),
    event(now - 300_000, ['X3']),
    event(now - 400_000, ['X4']),
    event(now - 500_000, ['X5']),
    event(cutAll,        ['X6']),  // exactly at cutAll → must be txNow
  ])
  const rCutAll = computeMetrics(makeSample([onlyCutAll]), W1, now)
  test('event exactly at now-windowMs counts as txNow (txPrev=0)', () => {
    assert.notEqual(rCutAll.trend, null)
    assert.equal(rCutAll.trend!.txNow,  6)
    assert.equal(rCutAll.trend!.txPrev, 0)
  })

  // Boundary: e4.ts === cutPrev counts as txPrev (< cutAll, >= cutPrev).
  // Build a sample with only events at cutPrev (and nearby +offsets so total ≥ 6).
  const onlyCutPrev = makeAnchor([
    event(cutPrev + 500_000, ['P1']),  // txPrev (< cutAll, >= cutPrev)
    event(cutPrev + 400_000, ['P2']),
    event(cutPrev + 300_000, ['P3']),
    event(cutPrev + 200_000, ['P4']),
    event(cutPrev + 100_000, ['P5']),
    event(cutPrev,           ['P6']),  // exactly at cutPrev → txPrev
  ])
  const rCutPrev = computeMetrics(makeSample([onlyCutPrev]), W1, now)
  test('event exactly at now-2*windowMs counts as txPrev (txNow=0)', () => {
    assert.notEqual(rCutPrev.trend, null)
    assert.equal(rCutPrev.trend!.txNow,  0)
    assert.equal(rCutPrev.trend!.txPrev, 6)
  })

  // Events older than 2 windows contribute to neither.
  const onlyOld = makeAnchor([
    event(cutPrev - 1,         ['Q1']),
    event(cutPrev - 100_000,   ['Q2']),
    event(cutPrev - 500_000,   ['Q3']),
    event(cutPrev - 1_000_000, ['Q4']),
    event(cutPrev - 1_500_000, ['Q5']),
    event(cutPrev - 2_000_000, ['Q6']),
  ])
  const rOld = computeMetrics(makeSample([onlyOld]), W1, now)
  test('events older than 2*windowMs count as neither → trend null', () => {
    assert.equal(rOld.trend, null)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fewer than 6 / exactly 6 threshold
//
// computeTrend returns null when txNow + txPrev < 6.
// Test n = 0..5 (→ null) and n = 6 (→ not null), using exact mode throughout
// (hasMore=false so isComplete is always true).
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. Threshold boundary (txNow + txPrev < 6 / = 6)')
{
  const now = 20_000_000
  const W2  = 3_600_000
  const cutAll  = now - W2
  const cutPrev = now - 2 * W2

  function makeNEvents(n: number): AnchorSample {
    // Alternate between txNow and txPrev slots so both receive events.
    const events: ActivityEvent[] = []
    for (let i = 0; i < n; i++) {
      const ts = i % 2 === 0
        ? cutAll  + 1000 * (i + 1)   // txNow  (> cutAll)
        : cutPrev + 1000 * (i + 1)   // txPrev (> cutPrev but < cutAll)
      events.push(event(ts, [`w${i}`]))
    }
    return makeAnchor(events)
  }

  for (let n = 0; n <= 6; n++) {
    const r = computeMetrics(makeSample([makeNEvents(n)]), W2, now)
    if (n < 6) {
      test(`${n} qualifying event(s) → trend null`, () => {
        assert.equal(r.trend, null)
      })
    } else {
      test(`6 qualifying events → trend not null`, () => {
        assert.notEqual(r.trend, null)
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Approx mode
//
// exact = anchors.every(s => isComplete(s, now-2*W))
// With hasMore=true and oldestOf(s) > now-2*W: isComplete=false → exact=false.
//
// For that anchor the code enters the else branch:
//   span = now - oldestOf(s)
//   if (span < 60_000) continue   // skip entirely
//   mid  = now - span / 2
//   e.ts >= mid  → txNow
//   e.ts < mid   → txPrev
//
// Final:  approx = !exact = true
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. Approx mode')
{
  const now = 30_000_000
  const W3  = 3_600_000
  // now - 2*W3 = 22_800_000  (anchor does NOT reach here → isComplete=false)

  // Anchor: hasMore=true, oldest event at now-2_000_000.
  //   span = 2_000_000
  //   mid  = now - 1_000_000 = 29_000_000
  //
  //   Events (newest-first; oldest is last):
  //     W1: now-500k   = 29_500_000 ≥ mid → txNow
  //     W5: now-600k   = 29_400_000 ≥ mid → txNow
  //     W6: now-700k   = 29_300_000 ≥ mid → txNow
  //     W2: now-1M     = 29_000_000 = mid → txNow  (>= mid is true at equality)
  //     W3: now-1.8M   = 28_200_000 < mid → txPrev
  //     W4: now-2M     = 28_000_000 < mid → txPrev  (oldest)
  //
  //   txNow=4  (W1,W5,W6,W2)
  //   txPrev=2 (W3,W4)
  //   total=6 → not null

  const sApprox = makeAnchor([
    event(now - 500_000,   ['W1']),
    event(now - 600_000,   ['W5']),
    event(now - 700_000,   ['W6']),
    event(now - 1_000_000, ['W2']),  // exactly at mid → txNow
    event(now - 1_800_000, ['W3']),
    event(now - 2_000_000, ['W4']),  // oldest → defines span
  ], /*hasMore=*/true)

  const r3 = computeMetrics(makeSample([sApprox]), W3, now)
  const t3 = r3.trend

  test('approx: trend not null (txNow+txPrev=6)', () => {
    assert.notEqual(t3, null)
  })
  test('approx: approx is true', () => {
    assert.equal(t3!.approx, true)
  })
  test('approx: txNow = 4 (newer-half events including midpoint)', () => {
    assert.equal(t3!.txNow, 4)
  })
  test('approx: txPrev = 2 (older-half events)', () => {
    assert.equal(t3!.txPrev, 2)
  })
  test('approx: walletsNow = 4 (W1,W2,W5,W6)', () => {
    assert.equal(t3!.walletsNow, 4)
  })
  test('approx: walletsPrev = 2 (W3,W4)', () => {
    assert.equal(t3!.walletsPrev, 2)
  })
  // The event exactly at mid (W2, ts = now-1_000_000 = mid) must be in txNow:
  // if it were in txPrev, walletsNow would be 3 not 4 and walletsPrev would be 3.
  test('approx: event exactly at mid counts as txNow (>= mid)', () => {
    // W2 is in wNow; walletsPrev has only W3,W4 (size=2, not 3)
    assert.equal(t3!.walletsPrev, 2)
  })

  // ── span < 60_000 ms → anchor skipped entirely ──
  // oldest event at now-59_999 → span=59_999 < 60_000 → skip
  // With only this anchor txNow+txPrev=0 → null
  const sShort = makeAnchor([
    event(now - 10_000, ['X1']),
    event(now - 20_000, ['X2']),
    event(now - 30_000, ['X3']),
    event(now - 40_000, ['X4']),
    event(now - 50_000, ['X5']),
    event(now - 59_999, ['X6']),  // oldest → span = 59_999 < 60_000
  ], /*hasMore=*/true)
  const rShort = computeMetrics(makeSample([sShort]), W3, now)
  test('approx: anchor with span < 60_000 ms is skipped → trend null', () => {
    assert.equal(rShort.trend, null)
  })

  // ── span exactly 60_000 ms → NOT skipped ──
  // oldest event at now-60_000 → span=60_000 (not < 60_000)
  // mid = now - 30_000
  //   Y1: now-1_000   > mid → txNow
  //   Y2: now-2_000   > mid → txNow
  //   Y3: now-29_999  > mid (29_970_001 > 29_970_000) → txNow
  //   Y4: now-31_000  < mid → txPrev
  //   Y5: now-50_000  < mid → txPrev
  //   Y6: now-60_000  < mid → txPrev  (oldest)
  // txNow=3, txPrev=3, total=6 → not null
  const sExact60 = makeAnchor([
    event(now - 1_000,  ['Y1']),
    event(now - 2_000,  ['Y2']),
    event(now - 29_999, ['Y3']),
    event(now - 31_000, ['Y4']),
    event(now - 50_000, ['Y5']),
    event(now - 60_000, ['Y6']),  // oldest → span = 60_000
  ], /*hasMore=*/true)
  const rExact60 = computeMetrics(makeSample([sExact60]), W3, now)
  test('approx: anchor with span exactly 60_000 ms is not skipped → trend not null', () => {
    assert.notEqual(rExact60.trend, null)
    assert.equal(rExact60.trend!.txNow,  3)
    assert.equal(rExact60.trend!.txPrev, 3)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mixed anchors (one complete, one not)
//
// exact = false (incomplete anchor breaks it) → approx = true for the whole result.
//
// Inside the loop the branch condition is: exact || isComplete(s, now-2*W)
//   – complete anchor: isComplete=true → window-comparison branch (txNow/txPrev)
//   – incomplete anchor: isComplete=false → approx span/2 branch
//
// Numbers are worked out for both anchors independently, then summed.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. Mixed anchors')
{
  const now = 40_000_000
  const W4  = 3_600_000
  const cutAll  = now - W4        // 36_400_000
  const cutPrev = now - 2 * W4   // 32_800_000

  // ── Complete anchor (hasMore=false) uses window-comparison branch ──
  //   cE1: now-500k   > cutAll          → txNow, wallet CA
  //   cE2: cutAll                       → txNow, wallet CB  (== cutAll → txNow)
  //   cE3: cutPrev+100k < cutAll, ≥ cutPrev → txPrev, wallet CC
  // Contribution: txNow+=2, txPrev+=1
  const cE1 = event(now - 500_000,     ['CA'])
  const cE2 = event(cutAll,            ['CB'])
  const cE3 = event(cutPrev + 100_000, ['CC'])
  const sComplete = makeAnchor([cE1, cE2, cE3], /*hasMore=*/false, 'token')

  // ── Incomplete anchor (hasMore=true, oldest at now-2_400_000) ──
  // oldestOf = now-2_400_000  (< now-2*W=cutPrev? no: now-2.4M=37_600_000 > 32_800_000)
  // isComplete(s, cutPrev) = false → approx branch
  //   span = 2_400_000
  //   mid  = now - 1_200_000 = 38_800_000
  //
  //   iE1: now-400k   = 39_600_000 ≥ mid → txNow, wallet IA
  //   iE2: now-1.2M   = 38_800_000 = mid → txNow (>=), wallet IB
  //   iE3: now-2M     = 38_000_000 < mid → txPrev, wallet IC
  //   iE4: now-2.4M   = 37_600_000 < mid → txPrev, wallet ID  (oldest)
  // Contribution: txNow+=2, txPrev+=2
  const iE1 = event(now - 400_000,   ['IA'])
  const iE2 = event(now - 1_200_000, ['IB'])  // exactly at mid → txNow
  const iE3 = event(now - 2_000_000, ['IC'])
  const iE4 = event(now - 2_400_000, ['ID'])  // oldest
  const sIncomplete = makeAnchor([iE1, iE2, iE3, iE4], /*hasMore=*/true, 'contract')

  // Totals:
  //   txNow  = 2 (complete) + 2 (approx) = 4
  //   txPrev = 1 (complete) + 2 (approx) = 3
  //   total  = 7 → not null
  //   walletsNow:  {CA, CB} ∪ {IA, IB} = 4
  //   walletsPrev: {CC}     ∪ {IC, ID} = 3
  //   approx = !exact = true

  const r4 = computeMetrics(makeSample([sComplete, sIncomplete]), W4, now)
  const t4 = r4.trend

  test('mixed: trend not null (7 qualifying events)', () => {
    assert.notEqual(t4, null)
  })
  test('mixed: approx = true (one incomplete anchor)', () => {
    assert.equal(t4!.approx, true)
  })
  test('mixed: txNow = 4 (window 2 + approx newer 2)', () => {
    assert.equal(t4!.txNow, 4)
  })
  test('mixed: txPrev = 3 (window 1 + approx older 2)', () => {
    assert.equal(t4!.txPrev, 3)
  })
  test('mixed: walletsNow = 4 (CA,CB,IA,IB)', () => {
    assert.equal(t4!.walletsNow, 4)
  })
  test('mixed: walletsPrev = 3 (CC,IC,ID)', () => {
    assert.equal(t4!.walletsPrev, 3)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. exclude set removes events
//
// skip(e) = !!exclude && e.wallets.some(w => exclude.has(w))
// If ANY wallet in the event is in the exclude set the WHOLE event is dropped
// from txNow, txPrev, walletsNow, and walletsPrev.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5. exclude set')
{
  const now = 50_000_000
  const W5  = 3_600_000
  const _cutAll = now - W5       // documented for clarity; not referenced directly
  const cutPrev = now - 2 * W5

  // 8 events (hasMore=false → exact mode):
  //   txNow candidates (ts > _cutAll):
  //     xE1: now-100k, ['user1']          → not excluded
  //     xE2: now-200k, ['bot1']           → EXCLUDED
  //     xE3: now-300k, ['user2','bot2']   → EXCLUDED (bot2 in set even though user2 is clean)
  //     xE4: now-400k, ['user3']          → not excluded
  //   txPrev candidates (cutPrev ≤ ts < cutAll):
  //     xE5: cutPrev+100k, ['user4']       → not excluded
  //     xE6: cutPrev+200k, ['bot1']        → EXCLUDED
  //     xE7: cutPrev+300k, ['user5']       → not excluded
  //     xE8: cutPrev+400k, ['user6']       → not excluded
  //
  // Without exclusion: txNow=4, txPrev=4, total=8 → not null
  // With   exclusion:  txNow=2 (xE1,xE4), txPrev=3 (xE5,xE7,xE8), total=5 → null

  const xE1 = event(now - 100_000,         ['user1'])
  const xE2 = event(now - 200_000,         ['bot1'])
  const xE3 = event(now - 300_000,         ['user2', 'bot2'])
  const xE4 = event(now - 400_000,         ['user3'])
  const xE5 = event(cutPrev + 400_000,     ['user4'])  // newest-first ordering → highest ts first
  const xE6 = event(cutPrev + 300_000,     ['bot1'])
  const xE7 = event(cutPrev + 200_000,     ['user5'])
  const xE8 = event(cutPrev + 100_000,     ['user6'])

  const sEx = makeAnchor([xE1, xE2, xE3, xE4, xE5, xE6, xE7, xE8])
  const excluded = new Set(['bot1', 'bot2'])

  const rNoEx = computeMetrics(makeSample([sEx]), W5, now)
  test('exclude: no exclude set → trend not null, txNow=4', () => {
    assert.notEqual(rNoEx.trend, null)
    assert.equal(rNoEx.trend!.txNow, 4)
  })
  test('exclude: no exclude set → txPrev=4', () => {
    assert.equal(rNoEx.trend!.txPrev, 4)
  })

  const rEx = computeMetrics(makeSample([sEx]), W5, now, excluded)
  test('exclude: after exclusion txNow+txPrev=5 → trend null', () => {
    assert.equal(rEx.trend, null)
  })

  // Add 2 more non-excluded txNow events to push total to 7 (5+2).
  //   xE9:  now-500k, ['user7'] → txNow
  //   xE10: now-600k, ['user8'] → txNow
  // After exclusion: txNow=4 (xE1,xE4,xE9,xE10), txPrev=3 (xE5,xE7,xE8), total=7
  // walletsNow:  {user1, user3, user7, user8} = 4
  // walletsPrev: {user4, user5, user6}        = 3

  const xE9  = event(now - 500_000, ['user7'])
  const xE10 = event(now - 600_000, ['user8'])
  const sEx2 = makeAnchor([xE1, xE2, xE3, xE4, xE9, xE10, xE5, xE6, xE7, xE8])
  const rEx2 = computeMetrics(makeSample([sEx2]), W5, now, excluded)
  const t5   = rEx2.trend

  test('exclude: with extra events, trend not null (7 qualifying)', () => {
    assert.notEqual(t5, null)
  })
  test('exclude: txNow = 4 (bot events removed)', () => {
    assert.equal(t5!.txNow, 4)
  })
  test('exclude: txPrev = 3 (bot event removed)', () => {
    assert.equal(t5!.txPrev, 3)
  })
  test('exclude: walletsNow = 4 (user1,user3,user7,user8)', () => {
    assert.equal(t5!.walletsNow, 4)
  })
  test('exclude: walletsPrev = 3 (user4,user5,user6)', () => {
    assert.equal(t5!.walletsPrev, 3)
  })
  // xE3 had user2 (clean) + bot2 (excluded) → whole event dropped.
  // If xE3 were NOT dropped, walletsNow would include user2 → size 5.
  test('exclude: multi-wallet event dropped when any wallet is excluded', () => {
    assert.equal(t5!.walletsNow, 4)  // user2 absent confirms xE3 was dropped
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Boundary timestamps (isolated, self-contained confirmations)
//
// This section re-tests the exact window edges in stripped-down scenarios that
// make the boundary the ONLY thing under test, with no other events to obscure it.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6. Boundary timestamps (isolated)')
{
  const now = 60_000_000
  const W6  = 3_600_000
  const cutAll  = now - W6
  const cutPrev = now - 2 * W6

  // ── Event at exactly cutAll → txNow ──
  // 6 events all at cutAll or newer; all land in txNow.
  // txNow=6, txPrev=0, total=6 → not null; txPrev=0 proves cutAll event is txNow.
  const sCutAll = makeAnchor([
    event(cutAll + 5, ['BN5']),
    event(cutAll + 4, ['BN4']),
    event(cutAll + 3, ['BN3']),
    event(cutAll + 2, ['BN2']),
    event(cutAll + 1, ['BN1']),
    event(cutAll,     ['BN0']),  // exactly at now-W
  ])
  const rCutAll = computeMetrics(makeSample([sCutAll]), W6, now)
  test('boundary: event at now-windowMs → txNow; txPrev=0 with only txNow events', () => {
    assert.notEqual(rCutAll.trend, null)
    assert.equal(rCutAll.trend!.txNow,  6)
    assert.equal(rCutAll.trend!.txPrev, 0)
  })

  // ── Event at exactly cutPrev → txPrev ──
  // 6 events all at cutPrev (or slightly above); all land in txPrev (< cutAll, >= cutPrev).
  // txNow=0, txPrev=6, total=6 → not null; txNow=0 proves cutPrev event is txPrev.
  const sCutPrev = makeAnchor([
    event(cutPrev + 500_000, ['BP5']),
    event(cutPrev + 400_000, ['BP4']),
    event(cutPrev + 300_000, ['BP3']),
    event(cutPrev + 200_000, ['BP2']),
    event(cutPrev + 100_000, ['BP1']),
    event(cutPrev,           ['BP0']),  // exactly at now-2*W
  ])
  const rCutPrev = computeMetrics(makeSample([sCutPrev]), W6, now)
  test('boundary: event at now-2*windowMs → txPrev; txNow=0 with only txPrev events', () => {
    assert.notEqual(rCutPrev.trend, null)
    assert.equal(rCutPrev.trend!.txNow,  0)
    assert.equal(rCutPrev.trend!.txPrev, 6)
  })

  // ── Event 1 ms before cutPrev → neither ──
  // 6 events all 1ms-or-more before cutPrev; none qualify → txNow+txPrev=0 → null.
  const sBeforePrev = makeAnchor(
    Array.from({ length: 6 }, (_, i) => event(cutPrev - 1 - i, [`Old${i}`]))
  )
  const rBeforePrev = computeMetrics(makeSample([sBeforePrev]), W6, now)
  test('boundary: events 1 ms before now-2*windowMs count as neither → trend null', () => {
    assert.equal(rBeforePrev.trend, null)
  })

  // ── cutAll-1 (one ms before cutAll) → txPrev (not txNow) ──
  // Pair it with cutAll to confirm the two boundary values land in different buckets.
  // 5 txNow + 1 txPrev = 6 total; txPrev=1 proves cutAll-1 is NOT txNow.
  const sMixBoundary = makeAnchor([
    event(cutAll + 4, ['M5']),
    event(cutAll + 3, ['M4']),
    event(cutAll + 2, ['M3']),
    event(cutAll + 1, ['M2']),
    event(cutAll,     ['M1']),  // → txNow
    event(cutAll - 1, ['M0']),  // → txPrev (< cutAll, >= cutPrev)
  ])
  const rMix = computeMetrics(makeSample([sMixBoundary]), W6, now)
  test('boundary: cutAll → txNow; cutAll-1 → txPrev (different buckets)', () => {
    assert.notEqual(rMix.trend, null)
    assert.equal(rMix.trend!.txNow,  5)
    assert.equal(rMix.trend!.txPrev, 1)
  })
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. Exclusion also applies in approx (busy anchor) mode — added after mutation testing
//   now=10_000_000, W=3_600_000, oldest event at now-600_000 -> span 600_000, mid = now-300_000
// ─────────────────────────────────────────────────────────────────────────────
{
  const now = 10_000_000
  const W = 3_600_000
  const evs = [
    event(now - 10_000, ['u1']),
    event(now - 20_000, ['u2']),
    event(now - 30_000, ['u3']),
    event(now - 40_000, ['bot']), // newer half, excluded
    event(now - 400_000, ['u4']),
    event(now - 450_000, ['u5']),
    event(now - 500_000, ['u6']),
    event(now - 550_000, ['bot']), // older half, excluded
    event(now - 600_000, ['u7']),
  ]
  const sample = makeSample([makeAnchor(evs, true)])
  const withBot = computeMetrics(sample, W, now).trend
  const noBot = computeMetrics(sample, W, now, new Set(['bot'])).trend
  test('approx exclude: without exclusion newer=4, older=5', () => {
    assert.equal(withBot!.txNow, 4)
    assert.equal(withBot!.txPrev, 5)
  })
  test('approx exclude: bot events removed from both halves', () => {
    assert.equal(noBot!.approx, true)
    assert.equal(noBot!.txNow, 3)
    assert.equal(noBot!.txPrev, 4)
    assert.equal(noBot!.walletsNow, 3)
    assert.equal(noBot!.walletsPrev, 4)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n✓ All ${passed} assertions passed.`)
