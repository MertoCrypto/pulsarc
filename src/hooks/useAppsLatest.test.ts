/**
 * Tests for pure functions in src/lib/appsLatest.ts.
 * Run with: node --experimental-strip-types src/hooks/useAppsLatest.test.ts
 * No frameworks, no network — plain node:assert only.
 */
import assert from 'node:assert/strict'

// Import the pure library directly (no React / react-query in scope).
import {
  parseAppsLatest,
  getAppWindow,
  windowsDiffer,
  isFresh,
  toAppMetricsPatch,
} from '../lib/appsLatest.ts'

// ── shared fixture ────────────────────────────────────────────────────────────

const SAMPLE_RAW = {
  network: 'testnet',
  generatedAt: '2026-10-10T07:42:19.213Z',
  note: 'walletHours sums distinct wallets per hour — an upper bound on unique wallets over the window',
  apps: {
    usdc: {
      '1h':  { txs: 8261, walletHours: 1990, volume: 58446.6531, fees: 0 },
      '24h': { txs: 8261, walletHours: 1990, volume: 58446.6531, fees: 0 },
      '7d':  { txs: 8261, walletHours: 1990, volume: 58446.6531, fees: 0 },
    },
    stablefx: {
      '1h':  { txs: 701, walletHours: 2, volume: 0, fees: 3.887328 },
      '24h': { txs: 701, walletHours: 2, volume: 0, fees: 3.887328 },
      '7d':  { txs: 701, walletHours: 2, volume: 0, fees: 3.887328 },
    },
    memo: {
      '1h':  { txs: 0, walletHours: 0, volume: 0, fees: 0 },
      '24h': { txs: 0, walletHours: 0, volume: 0, fees: 0 },
      '7d':  { txs: 0, walletHours: 0, volume: 0, fees: 0 },
    },
  },
}

// Hand-made "caught-up" fixture where windows genuinely differ
const CAUGHT_UP_RAW = {
  network: 'testnet',
  generatedAt: '2026-10-10T07:42:19.213Z',
  apps: {
    usdc: {
      '1h':  { txs: 100,  walletHours: 50,  volume: 1000, fees: 1 },
      '24h': { txs: 1500, walletHours: 400, volume: 8000, fees: 12 },
      '7d':  { txs: 9000, walletHours: 2000, volume: 50000, fees: 70 },
    },
  },
}

let pass = 0
let fail = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✔ ${name}`)
    pass++
  } catch (err) {
    console.error(`  ✘ ${name}`)
    console.error(`    ${(err as Error).message}`)
    fail++
  }
}

// ── parseAppsLatest ───────────────────────────────────────────────────────────

console.log('\nparseAppsLatest')

test('parses the sample JSON correctly', () => {
  const snap = parseAppsLatest(SAMPLE_RAW)
  assert.ok(snap !== null, 'should return non-null')
  assert.equal(snap.network, 'testnet')
  assert.equal(snap.generatedAt, '2026-10-10T07:42:19.213Z')
  assert.ok(typeof snap.note === 'string')
  assert.ok('usdc' in snap.apps)
  assert.equal(snap.apps['usdc']['1h'].txs, 8261)
  assert.equal(snap.apps['usdc']['1h'].walletHours, 1990)
  assert.equal(snap.apps['usdc']['1h'].volume, 58446.6531)
  assert.equal(snap.apps['stablefx']['1h'].fees, 3.887328)
})

test('returns null for null input', () => {
  assert.equal(parseAppsLatest(null), null)
})

test('returns null for non-object input', () => {
  assert.equal(parseAppsLatest('not-an-object'), null)
  assert.equal(parseAppsLatest(42), null)
  assert.equal(parseAppsLatest([]), null)
})

test('returns null when network is missing', () => {
  assert.equal(parseAppsLatest({ generatedAt: '2026-10-10T00:00:00Z', apps: {} }), null)
})

test('returns null when network is invalid', () => {
  assert.equal(parseAppsLatest({ network: 'arbitrum', generatedAt: '2026-10-10T00:00:00Z', apps: {} }), null)
})

test('returns null when generatedAt is missing', () => {
  assert.equal(parseAppsLatest({ network: 'testnet', apps: {} }), null)
})

test('returns null when apps is not an object', () => {
  assert.equal(parseAppsLatest({ network: 'testnet', generatedAt: '2026-10-10T00:00:00Z', apps: [] }), null)
  assert.equal(parseAppsLatest({ network: 'testnet', generatedAt: '2026-10-10T00:00:00Z', apps: 'bad' }), null)
})

test('drops apps with NaN numbers but keeps valid ones', () => {
  const snap = parseAppsLatest({
    network: 'testnet',
    generatedAt: '2026-10-10T00:00:00Z',
    apps: {
      good: {
        '1h':  { txs: 1, walletHours: 2, volume: 3, fees: 4 },
        '24h': { txs: 5, walletHours: 6, volume: 7, fees: 8 },
        '7d':  { txs: 9, walletHours: 10, volume: 11, fees: 12 },
      },
      bad: {
        '1h':  { txs: NaN, walletHours: 0, volume: 0, fees: 0 },
        '24h': { txs: 0,   walletHours: 0, volume: 0, fees: 0 },
        '7d':  { txs: 0,   walletHours: 0, volume: 0, fees: 0 },
      },
    },
  })
  assert.ok(snap !== null)
  assert.ok('good' in snap!.apps, 'good app should be kept')
  assert.ok(!('bad' in snap!.apps), 'bad app with NaN should be dropped')
})

test('drops apps with missing window', () => {
  const snap = parseAppsLatest({
    network: 'testnet',
    generatedAt: '2026-10-10T00:00:00Z',
    apps: {
      incomplete: {
        '1h':  { txs: 1, walletHours: 2, volume: 3, fees: 4 },
        // missing 24h and 7d
      },
    },
  })
  assert.ok(snap !== null)
  assert.ok(!('incomplete' in snap!.apps), 'app with missing window should be dropped')
})

test('accepts mainnet with empty apps (real mainnet case)', () => {
  const snap = parseAppsLatest({ network: 'mainnet', generatedAt: '2026-10-10T00:00:00Z', apps: {} })
  assert.ok(snap !== null)
  assert.equal(snap!.network, 'mainnet')
  assert.deepEqual(snap!.apps, {})
})

// ── getAppWindow ──────────────────────────────────────────────────────────────

console.log('\ngetAppWindow')

const SNAP = parseAppsLatest(SAMPLE_RAW)!

test('returns correct stats for known app + window', () => {
  const w = getAppWindow(SNAP, 'usdc', '24h')
  assert.ok(w !== null)
  assert.equal(w!.txs, 8261)
})

test('returns null for unknown appId', () => {
  assert.equal(getAppWindow(SNAP, 'does-not-exist', '24h'), null)
})

test('returns null for null snapshot', () => {
  assert.equal(getAppWindow(null, 'usdc', '1h'), null)
})

test('returns null for undefined snapshot', () => {
  assert.equal(getAppWindow(undefined, 'usdc', '1h'), null)
})

test('returns null for empty mainnet apps', () => {
  const emptySnap = parseAppsLatest({ network: 'mainnet', generatedAt: '2026-10-10T00:00:00Z', apps: {} })!
  assert.equal(getAppWindow(emptySnap, 'usdc', '24h'), null)
})

// ── windowsDiffer ─────────────────────────────────────────────────────────────

console.log('\nwindowsDiffer')

test('returns false on the sample (all windows identical — still catching up)', () => {
  assert.equal(windowsDiffer(SNAP), false)
})

test('returns true on the caught-up fixture', () => {
  const caughtUp = parseAppsLatest(CAUGHT_UP_RAW)!
  assert.equal(windowsDiffer(caughtUp), true)
})

test('returns false on null', () => {
  assert.equal(windowsDiffer(null), false)
})

test('returns false on empty mainnet apps', () => {
  const emptySnap = parseAppsLatest({ network: 'mainnet', generatedAt: '2026-10-10T00:00:00Z', apps: {} })!
  assert.equal(windowsDiffer(emptySnap), false)
})

// ── isFresh ───────────────────────────────────────────────────────────────────

console.log('\nisFresh')

test('returns true when snapshot is recent', () => {
  const recentTs = new Date(Date.now() - 30 * 60_000).toISOString() // 30 min ago
  const snap = parseAppsLatest({ network: 'testnet', generatedAt: recentTs, apps: {} })!
  assert.equal(isFresh(snap), true)
})

test('returns false when snapshot is older than maxAgeMs', () => {
  const oldTs = new Date(Date.now() - 4 * 3_600_000).toISOString() // 4 hours ago
  const snap = parseAppsLatest({ network: 'testnet', generatedAt: oldTs, apps: {} })!
  assert.equal(isFresh(snap), false)
})

test('returns false on null snapshot', () => {
  assert.equal(isFresh(null), false)
})

test('respects custom maxAgeMs', () => {
  const ts = new Date(Date.now() - 10_000).toISOString() // 10 seconds ago
  const snap = parseAppsLatest({ network: 'testnet', generatedAt: ts, apps: {} })!
  assert.equal(isFresh(snap, 5_000), false)  // 5 second max → stale
  assert.equal(isFresh(snap, 30_000), true)  // 30 second max → fresh
})

// ── toAppMetricsPatch ─────────────────────────────────────────────────────────

console.log('\ntoAppMetricsPatch')

test('maps non-zero values correctly', () => {
  const patch = toAppMetricsPatch({ txs: 100, walletHours: 50, volume: 1234.5, fees: 0.5 })
  assert.equal(patch.txCount, 100)
  assert.equal(patch.activeWallets, 50)
  assert.equal(patch.volume, 1234.5)
  assert.equal(patch.usdcFees, 0.5)
  assert.equal(patch.source, 'indexer')
})

test('maps zero volume to null', () => {
  const patch = toAppMetricsPatch({ txs: 10, walletHours: 5, volume: 0, fees: 1 })
  assert.equal(patch.volume, null)
  assert.equal(patch.usdcFees, 1)
})

test('maps zero fees to null', () => {
  const patch = toAppMetricsPatch({ txs: 10, walletHours: 5, volume: 100, fees: 0 })
  assert.equal(patch.usdcFees, null)
  assert.equal(patch.volume, 100)
})

test('maps both zeros to null', () => {
  const patch = toAppMetricsPatch({ txs: 0, walletHours: 0, volume: 0, fees: 0 })
  assert.equal(patch.txCount, 0)
  assert.equal(patch.activeWallets, 0)
  assert.equal(patch.volume, null)
  assert.equal(patch.usdcFees, null)
  assert.equal(patch.source, 'indexer')
})

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
