/**
 * Unit tests for the pure math in appMetrics.ts.
 * Run with:
 *   node --experimental-strip-types src/lib/appMetrics.test.ts
 *
 * No test framework — uses node:assert only.
 * All tests pass an explicit `now` so results are deterministic.
 */
import assert from 'node:assert/strict'
import {
  computeMetrics,
  buildHistory,
  describeSpan,
  lifetimeMetrics,
  RANGE_MS,
  RANK_RANGE_MS,
  type AppSample,
  type AnchorSample,
  type ActivityEvent,
  type AppLifetime,
} from './appMetrics.ts'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Cast a plain object to the opaque Anchor type without importing @/data/apps. */
function anchor(fields: { usd?: boolean; kind?: string } = {}) {
  return fields as unknown as AnchorSample['anchor']
}

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    ts: 0,
    wallets: [],
    usd: null,
    fee: 0,
    hash: 'hash',
    ...overrides,
  }
}

function makeAnchorSample(overrides: Partial<AnchorSample> = {}): AnchorSample {
  return {
    anchor: anchor(),
    events: [],
    hasMore: false,
    balance: 0,
    ...overrides,
  }
}

function makeAppSample(appId: string, anchors: AnchorSample[]): AppSample {
  return { appId, anchors, fetchedAt: 0 }
}

let pass = 0
function check(label: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓  ${label}`)
  } catch (err) {
    console.error(`  ✗  ${label}`)
    throw err
  }
}

// ─── RANGE_MS / RANK_RANGE_MS ────────────────────────────────────────────────

console.log('\nRANGE_MS / RANK_RANGE_MS')

check('RANGE_MS 1h = 3_600_000', () => {
  assert.equal(RANGE_MS['1h'], 3_600_000); pass++
})
check('RANGE_MS 24h = 86_400_000', () => {
  assert.equal(RANGE_MS['24h'], 86_400_000); pass++
})
check('RANK_RANGE_MS 7d = 604_800_000', () => {
  assert.equal(RANK_RANGE_MS['7d'], 7 * 86_400_000); pass++
})
check('RANK_RANGE_MS 30d = 2_592_000_000', () => {
  assert.equal(RANK_RANGE_MS['30d'], 30 * 86_400_000); pass++
})
check('RANK_RANGE_MS contains 1h and 24h', () => {
  assert.equal(RANK_RANGE_MS['1h'], 3_600_000)
  assert.equal(RANK_RANGE_MS['24h'], 86_400_000)
  pass += 2
})

// ─── describeSpan ────────────────────────────────────────────────────────────

console.log('\ndescribeSpan')

check('45_000 -> "45 seconds"', () => {
  assert.equal(describeSpan(45_000), '45 seconds'); pass++
})
check('89_999 -> "90 seconds" (still < 90_000 boundary? no: 89_999 < 90_000)', () => {
  // 89_999 < 90_000 -> seconds branch -> Math.round(89999/1000) = 90
  assert.equal(describeSpan(89_999), '90 seconds'); pass++
})
check('boundary 90_000 -> "2 minutes" (>= 90_000 so minutes branch)', () => {
  // ms >= 90_000 and < 5_400_000 -> Math.round(90000/60000) = 2
  assert.equal(describeSpan(90_000), '2 minutes'); pass++
})
check('120_000 -> "2 minutes"', () => {
  assert.equal(describeSpan(120_000), '2 minutes'); pass++
})
check('5_399_999 -> "90 minutes" (still < 90*60_000)', () => {
  // Math.round(5399999/60000) = Math.round(89.99998) = 90
  assert.equal(describeSpan(5_399_999), '90 minutes'); pass++
})
check('boundary 90*60_000=5_400_000 -> hours branch', () => {
  // 5_400_000 / 3600_000 = 1.5 -> "1.5 hours"
  assert.equal(describeSpan(5_400_000), '1.5 hours'); pass++
})
check('2*3_600_000 -> "2.0 hours"', () => {
  assert.equal(describeSpan(2 * 3_600_000), '2.0 hours'); pass++
})
check('boundary 36*3_600_000=129_600_000 -> days branch', () => {
  // Math.round(129600000 / 86400000) = Math.round(1.5) = 2
  assert.equal(describeSpan(36 * 3_600_000), '2 days'); pass++
})
check('3*86_400_000 -> "3 days"', () => {
  assert.equal(describeSpan(3 * 86_400_000), '3 days'); pass++
})

// ─── lifetimeMetrics ─────────────────────────────────────────────────────────

console.log('\nlifetimeMetrics')

const baseLifetime: AppLifetime = {
  appId: 'test',
  txCount: 100,
  holders: null,
  tvl: 0,
  fetchedAt: 0,
}

check('holders null -> usersKnown false, activeWallets 0', () => {
  const m = lifetimeMetrics({ ...baseLifetime, holders: null })
  assert.equal(m.usersKnown, false)
  assert.equal(m.activeWallets, 0)
  pass += 2
})
check('holders 50 -> usersKnown true, activeWallets 50', () => {
  const m = lifetimeMetrics({ ...baseLifetime, holders: 50 })
  assert.equal(m.usersKnown, true)
  assert.equal(m.activeWallets, 50)
  pass += 2
})
check('tvl 0 -> tvl field is null', () => {
  const m = lifetimeMetrics({ ...baseLifetime, tvl: 0 })
  assert.equal(m.tvl, null); pass++
})
check('tvl > 0 passes through', () => {
  const m = lifetimeMetrics({ ...baseLifetime, tvl: 9999 })
  assert.equal(m.tvl, 9999); pass++
})
check('lifetime flag is true', () => {
  const m = lifetimeMetrics(baseLifetime)
  assert.equal(m.lifetime, true); pass++
})
check('txCount passes through', () => {
  const m = lifetimeMetrics({ ...baseLifetime, txCount: 42 })
  assert.equal(m.txCount, 42); pass++
})
check('estimated is false', () => {
  const m = lifetimeMetrics(baseLifetime)
  assert.equal(m.estimated, false); pass++
})
check('volume is null', () => {
  const m = lifetimeMetrics(baseLifetime)
  assert.equal(m.volume, null); pass++
})

// ─── computeMetrics ──────────────────────────────────────────────────────────

console.log('\ncomputeMetrics')

const NOW = 1_000_000_000_000 // fixed epoch ms
const WINDOW = 3_600_000      // 1 h

check('empty sample returns zero counts without NaN', () => {
  const sample = makeAppSample('a', [])
  const m = computeMetrics(sample, WINDOW, NOW)
  assert.equal(m.txCount, 0)
  assert.equal(m.activeWallets, 0)
  assert.equal(m.estimated, false)
  assert.equal(m.volume, null)
  assert.equal(m.tvl, null)
  assert.equal(m.usdcFees, null)
  assert.equal(Number.isNaN(m.txCount), false)
  pass += 7
})

check('complete sample: counts tx and distinct wallets exactly', () => {
  // 3 events in window, hasMore false (complete)
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A', 'B'] }),
    makeEvent({ ts: NOW - 200, wallets: ['B', 'C'] }),
    makeEvent({ ts: NOW - 300, wallets: ['A'] }),
  ]
  const s = makeAnchorSample({ events, hasMore: false })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.txCount, 3)           // 3 events, scale=1
  assert.equal(m.activeWallets, 3)     // A, B, C distinct
  assert.equal(m.estimated, false)
  pass += 3
})

check('wallet seen in multiple events counted once', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'] }),
    makeEvent({ ts: NOW - 200, wallets: ['A'] }),
    makeEvent({ ts: NOW - 300, wallets: ['A'] }),
  ]
  const s = makeAnchorSample({ events, hasMore: false })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.activeWallets, 1); pass++
})

check('events older than window start are excluded from tx count', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'] }),          // in window
    makeEvent({ ts: NOW - WINDOW - 1, wallets: ['B'] }),   // just outside
    makeEvent({ ts: NOW - WINDOW * 2, wallets: ['C'] }),   // far outside
  ]
  const s = makeAnchorSample({ events, hasMore: false })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.txCount, 1)
  assert.equal(m.activeWallets, 1)
  pass += 2
})

check('event at exactly window start IS excluded (ts < start is the condition, not <=)', () => {
  // start = NOW - WINDOW; event at ts === start passes (ts < start is false)
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - WINDOW, wallets: ['A'] }),  // ts === start, NOT < start -> included
  ]
  const s = makeAnchorSample({ events, hasMore: false })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.txCount, 1); pass++
})

check('hasMore true, oldest event newer than window start -> estimated, scaled', () => {
  // oldest event at NOW - 1800_000 (half the 1h window)
  // span = Math.max(NOW - (NOW - 1800_000), 5000) = 1_800_000
  // scale = windowMs / span = 3_600_000 / 1_800_000 = 2
  // 1 event in window -> txCount = Math.round(1 * 2) = 2
  const oldest = NOW - 1_800_000
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'] }),   // in window
    makeEvent({ ts: oldest, wallets: ['B'] }),       // oldest
  ]
  const s = makeAnchorSample({ events, hasMore: true })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.estimated, true)
  // Both events are inside the window (oldest >= start = NOW - 3_600_000), scale=2
  // txCount = Math.round(2 * 2) = 4
  assert.equal(m.txCount, 4)
  pass += 2
})

check('hasMore true but oldest event <= window start -> complete, not estimated', () => {
  // oldest at NOW - WINDOW - 1 -> oldestOf(s) <= start -> isComplete true
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'] }),
    makeEvent({ ts: NOW - WINDOW - 1, wallets: ['B'] }),
  ]
  const s = makeAnchorSample({ events, hasMore: true })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.estimated, false)
  assert.equal(m.txCount, 1)  // only the in-window event
  pass += 2
})

check('exclude set removes wallet from count', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A', 'B'] }),
    makeEvent({ ts: NOW - 200, wallets: ['C'] }),
  ]
  const s = makeAnchorSample({ events, hasMore: false })
  const excl = new Set(['A'])
  // Event 1: wallet A is in exclude set -> skip entire event (A OR B)
  // Event 2: C not excluded -> included
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW, excl)
  assert.equal(m.txCount, 1)
  assert.equal(m.activeWallets, 1)  // only C
  pass += 2
})

check('exclude: event excluded when ANY of its wallets matches', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A', 'INNOCENT'] }),
  ]
  const s = makeAnchorSample({ events, hasMore: false })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW, new Set(['A']))
  assert.equal(m.txCount, 0)
  assert.equal(m.activeWallets, 0)
  pass += 2
})

check('volume null when no event has usd amount AND anchor.usd is falsy', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'], usd: null }),
  ]
  const s = makeAnchorSample({ events, hasMore: false, anchor: anchor({ usd: false }) })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.volume, null); pass++
})

check('volume is a number when anchor.usd is true (even if event.usd is null)', () => {
  // anchor.usd = true sets hasUsd = true; no event usd, so usd stays 0
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'], usd: null }),
  ]
  const s = makeAnchorSample({ events, hasMore: false, anchor: anchor({ usd: true }) })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(typeof m.volume, 'number')
  assert.equal(m.volume, 0)
  pass += 2
})

check('volume sums event.usd values', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'], usd: 10 }),
    makeEvent({ ts: NOW - 200, wallets: ['B'], usd: 25 }),
    makeEvent({ ts: NOW - WINDOW - 1, wallets: ['C'], usd: 999 }), // outside window
  ]
  const s = makeAnchorSample({ events, hasMore: false, anchor: anchor({ usd: true }) })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.volume, 35); pass++
})

check('fees sum across events (contract anchor sets hasFees)', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'], fee: 0.5 }),
    makeEvent({ ts: NOW - 200, wallets: ['B'], fee: 0.25 }),
  ]
  const s = makeAnchorSample({ events, hasMore: false, anchor: anchor({ kind: 'contract' }) })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.usdcFees, 0.75); pass++
})

check('usdcFees null when no contract anchor', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'], fee: 1 }),
  ]
  const s = makeAnchorSample({ events, hasMore: false, anchor: anchor({ kind: 'token' }) })
  const m = computeMetrics(makeAppSample('a', [s]), WINDOW, NOW)
  assert.equal(m.usdcFees, null); pass++
})

check('tvl sums balance across anchors, null when 0', () => {
  const a1 = makeAnchorSample({ balance: 100 })
  const a2 = makeAnchorSample({ balance: 50 })
  const m = computeMetrics(makeAppSample('x', [a1, a2]), WINDOW, NOW)
  assert.equal(m.tvl, 150); pass++
})

check('tvl null when sum is 0', () => {
  const s = makeAnchorSample({ balance: 0 })
  const m = computeMetrics(makeAppSample('x', [s]), WINDOW, NOW)
  assert.equal(m.tvl, null); pass++
})

check('multiple anchors: wallets deduplicated across anchors', () => {
  const s1 = makeAnchorSample({ events: [makeEvent({ ts: NOW - 100, wallets: ['A', 'B'] })] })
  const s2 = makeAnchorSample({ events: [makeEvent({ ts: NOW - 200, wallets: ['B', 'C'] })] })
  const m = computeMetrics(makeAppSample('a', [s1, s2]), WINDOW, NOW)
  assert.equal(m.txCount, 2)
  assert.equal(m.activeWallets, 3) // A, B, C
  pass += 2
})

// ─── buildHistory ────────────────────────────────────────────────────────────

console.log('\nbuildHistory')

check('12 buckets when coveredMs <= 2h', () => {
  // all anchors complete, window = 2h -> coveredMs = 2h -> n = 12
  const WINDOW2H = 2 * 3_600_000
  const sample = makeAppSample('a', [makeAnchorSample()])
  const h = buildHistory([sample], WINDOW2H, NOW)
  assert.equal(h.total.length, 12); pass++
})

check('24 buckets when coveredMs > 2h', () => {
  // window = 3h -> coveredMs = 3h > 2h -> n = 24
  const WINDOW3H = 3 * 3_600_000
  const sample = makeAppSample('a', [makeAnchorSample()])
  const h = buildHistory([sample], WINDOW3H, NOW)
  assert.equal(h.total.length, 24); pass++
})

check('event at exactly now lands in last bucket', () => {
  // window = 1h, no hasMore -> from = NOW - 3_600_000, coveredMs = 3_600_000
  // n = 12, bucketMs = 300_000
  // idx = Math.min(11, Math.floor((NOW - from) / bucketMs))
  //     = Math.min(11, Math.floor(3_600_000 / 300_000)) = Math.min(11, 12) = 11
  const event = makeEvent({ ts: NOW, wallets: ['A'] })
  const s = makeAnchorSample({ events: [event], hasMore: false })
  const h = buildHistory([makeAppSample('a', [s])], WINDOW, NOW)
  assert.equal(h.total[11].txCount, 1)
  assert.equal(h.total[11].activeWallets, 1)
  pass += 2
})

check('events outside [from, now] are ignored', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'] }),        // in window
    makeEvent({ ts: NOW - WINDOW - 1, wallets: ['B'] }), // before from (complete anchor, from=windowStart)
    makeEvent({ ts: NOW + 1000, wallets: ['C'] }),        // after now
  ]
  const s = makeAnchorSample({ events, hasMore: false })
  const h = buildHistory([makeAppSample('a', [s])], WINDOW, NOW)
  const totalTx = h.total.reduce((acc, b) => acc + b.txCount, 0)
  assert.equal(totalTx, 1); pass++
})

check('event lands in correct bucket', () => {
  // window = 1h, coveredMs = 3_600_000, n=12, bucketMs=300_000
  // event at NOW - 100 (near end):
  //   idx = Math.min(11, Math.floor((NOW-100 - (NOW-3_600_000)) / 300_000))
  //       = Math.min(11, Math.floor(3_599_900 / 300_000))
  //       = Math.min(11, Math.floor(11.9996...)) = 11
  // event at NOW - 3_000_000 (5 buckets from start):
  //   idx = Math.min(11, Math.floor((NOW-3_000_000 - (NOW-3_600_000)) / 300_000))
  //       = Math.min(11, Math.floor(600_000 / 300_000)) = 2
  const eNear = makeEvent({ ts: NOW - 100, wallets: ['A'] })
  const eFar = makeEvent({ ts: NOW - 3_000_000, wallets: ['B'] })
  const s = makeAnchorSample({ events: [eNear, eFar], hasMore: false })
  const h = buildHistory([makeAppSample('a', [s])], WINDOW, NOW)
  assert.equal(h.total[11].txCount, 1)
  assert.equal(h.total[2].txCount, 1)
  pass += 2
})

check('perApp and total agree: total tx equals sum of perApp tx', () => {
  const s1 = makeAnchorSample({ events: [makeEvent({ ts: NOW - 100, wallets: ['A'] })] })
  const s2 = makeAnchorSample({ events: [makeEvent({ ts: NOW - 200, wallets: ['B'] })] })
  const app1 = makeAppSample('app1', [s1])
  const app2 = makeAppSample('app2', [s2])
  const h = buildHistory([app1, app2], WINDOW, NOW)
  const totalTx = h.total.reduce((a, b) => a + b.txCount, 0)
  const perAppTx = Object.values(h.perApp).reduce(
    (sum, pts) => sum + pts.reduce((a, b) => a + b.txCount, 0), 0
  )
  assert.equal(totalTx, perAppTx)
  assert.equal(totalTx, 2)
  pass += 2
})

check('complete=false and shorter coveredMs when busy anchor does not reach window start', () => {
  // busy anchor: hasMore=true, oldest event at NOW - 1_800_000 (half-window)
  // -> isComplete(s, windowStart) = false -> from = max(windowStart, NOW-1_800_000) = NOW-1_800_000
  // coveredMs = NOW - (NOW - 1_800_000) = 1_800_000
  const oldest = NOW - 1_800_000
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'] }),
    makeEvent({ ts: oldest, wallets: ['B'] }),
  ]
  const s = makeAnchorSample({ events, hasMore: true })
  const h = buildHistory([makeAppSample('a', [s])], WINDOW, NOW)
  assert.equal(h.complete, false)
  assert.equal(h.coveredMs, 1_800_000)
  pass += 2
})

check('complete=true when all anchors are complete', () => {
  const events: ActivityEvent[] = [
    makeEvent({ ts: NOW - 100, wallets: ['A'] }),
    makeEvent({ ts: NOW - WINDOW - 1, wallets: ['B'] }),  // older than window
  ]
  const s = makeAnchorSample({ events, hasMore: false })  // hasMore false -> always complete
  const h = buildHistory([makeAppSample('a', [s])], WINDOW, NOW)
  assert.equal(h.complete, true); pass++
})

check('label hh:mm format for short spans (coveredMs <= 36h)', () => {
  // coveredMs = 1h <= 36h, bucketMs = 3_600_000/12 = 300_000 >= 60_000
  // -> labelFor uses hh:mm branch
  // from = NOW - 3_600_000; bucket 0 label = localtime of (NOW - 3_600_000)
  const from = NOW - WINDOW
  const d = new Date(from) // local time
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const expected = `${hh}:${mm}`
  const h = buildHistory([makeAppSample('a', [makeAnchorSample()])], WINDOW, NOW)
  assert.equal(h.total[0].label, expected); pass++
})

check('label M/D format for spans > 36h', () => {
  // Use a window of 48h -> coveredMs = 48h > 36h -> M/D format
  // n = 24, from = NOW - 48h
  const WINDOW48H = 48 * 3_600_000
  const from = NOW - WINDOW48H
  const d = new Date(from)
  const expected = `${d.getMonth() + 1}/${d.getDate()}`
  const h = buildHistory([makeAppSample('a', [makeAnchorSample()])], WINDOW48H, NOW)
  assert.equal(h.total[0].label, expected); pass++
})

check('perApp entry for app with no events is still present with zero counts', () => {
  const sample = makeAppSample('myapp', [makeAnchorSample()])
  const h = buildHistory([sample], WINDOW, NOW)
  assert.ok(Object.prototype.hasOwnProperty.call(h.perApp, 'myapp'))
  const totalTx = h.perApp['myapp'].reduce((a, b) => a + b.txCount, 0)
  assert.equal(totalTx, 0)
  pass += 2
})


// ─── boundaries (added after mutation testing) ──────────────────────────────

console.log('\nboundaries')

check('computeMetrics: oldest event exactly at the window start counts as complete', () => {
  const now = 1_000_000
  const windowMs = 100_000
  const s = makeAnchorSample({
    hasMore: true,
    events: [makeEvent({ ts: now - 50_000 }), makeEvent({ ts: now - windowMs })],
  })
  const m = computeMetrics(makeAppSample('a', [s]), windowMs, now)
  assert.equal(m.estimated, false)
  assert.equal(m.txCount, 2)
  pass += 2
})

check('computeMetrics: the sampled span is floored at 5 seconds before extrapolating', () => {
  const now = 1_000_000
  const windowMs = 100_000
  const s = makeAnchorSample({ hasMore: true, events: [makeEvent({ ts: now - 1000 })] })
  const m = computeMetrics(makeAppSample('a', [s]), windowMs, now)
  assert.equal(m.estimated, true)
  assert.equal(m.txCount, 20) // 1 event * 100000 / 5000, not * 100000 / 1000
  pass += 2
})

check('describeSpan: 30 hours is still shown in hours (36 h is the switch to days)', () => {
  assert.equal(describeSpan(30 * 3600_000), '30.0 hours')
  assert.equal(describeSpan(36 * 3600_000), '2 days') // 1.5 days rounds up
  pass += 2
})

check('buildHistory: a 30 h span still uses hh:mm labels (M/D starts above 36 h)', () => {
  const now = 100 * 3600_000
  const s = makeAnchorSample({ hasMore: true, events: [makeEvent({ ts: now - 30 * 3600_000 })] })
  const h = buildHistory([makeAppSample('a', [s])], 48 * 3600_000, now)
  assert.ok(/^\d\d:\d\d$/.test(h.total[0].label), `got ${h.total[0].label}`)
  pass += 1
})

check('buildHistory: covered span is at least one second', () => {
  assert.equal(buildHistory([], 1, 1_000_000).coveredMs, 1000)
  pass += 1
})

// ─── summary ────────────────────────────────────────────────────────────────

console.log(`\nAll assertions: ${pass}`)
console.log('All tests passed.')
