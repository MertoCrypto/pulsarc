/**
 * Unit tests for src/lib/rankBadges.ts
 * Run:  node --experimental-strip-types --no-warnings src/lib/rankBadges.test.ts
 */
import assert from 'node:assert/strict'
import type { AppMetrics } from './appMetrics.ts'
import { computeRankBadges, type BadgeWindow, type WindowMetrics } from './rankBadges.ts'

// ── helpers ───────────────────────────────────────────────────────────────────

let passed = 0
function ok(label: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${label}`)
}

function m(overrides: Partial<AppMetrics> = {}): AppMetrics {
  return {
    txCount: 0,
    activeWallets: 0,
    volume: null,
    tvl: null,
    usdcFees: null,
    rankChange: 0,
    trend: null,
    estimated: false,
    ...overrides,
  }
}

function wm(appKey: string, activeWallets: number, txCount = 0): WindowMetrics {
  return { appKey, metrics: m({ activeWallets, txCount }) }
}

const ALL_WINDOWS: BadgeWindow[] = ['24h', '7d', '30d']

// ── disabled window gate ──────────────────────────────────────────────────────

console.log('\ncomputeRankBadges — disabled window gate')

ok('window absent from allowedWindows produces no badge', () => {
  const list = [wm('app-a', 5), wm('app-b', 3)]
  const badges = computeRankBadges(
    { '24h': list, '7d': list },
    'app-a',
    ['24h'], // 7d not allowed
  )
  assert.ok(badges.every(b => b.window !== '7d'), 'no 7d badge')
  assert.equal(badges.length, 1)
  assert.equal(badges[0].window, '24h')
})

ok('mainnet-style: only 24h allowed, returns only 24h badge', () => {
  const list = [wm('app-a', 10), wm('app-b', 5)]
  const badges = computeRankBadges(
    { '24h': list, '7d': list, '30d': list },
    'app-a',
    ['24h'],
  )
  assert.equal(badges.length, 1)
  assert.equal(badges[0].window, '24h')
})

// ── no usable data gate ───────────────────────────────────────────────────────

console.log('\ncomputeRankBadges — no usable data gate')

ok('null window data produces no badge', () => {
  const badges = computeRankBadges(
    { '24h': null, '7d': [wm('app-a', 5)] },
    'app-a',
    ALL_WINDOWS,
  )
  assert.ok(badges.every(b => b.window !== '24h'), 'no 24h badge when null')
})

ok('empty array for a window produces no badge', () => {
  const badges = computeRankBadges(
    { '24h': [], '7d': [wm('app-a', 5)] },
    'app-a',
    ALL_WINDOWS,
  )
  assert.ok(badges.every(b => b.window !== '24h'), 'no 24h badge when empty')
})

ok('missing key in windowMetrics produces no badge for that window', () => {
  const badges = computeRankBadges(
    { '7d': [wm('app-a', 5)] }, // '24h' key is absent
    'app-a',
    ALL_WINDOWS,
  )
  assert.ok(badges.every(b => b.window !== '24h'), 'no 24h badge when key missing')
})

ok('if all windows have no usable data, returns empty array', () => {
  const badges = computeRankBadges({ '24h': null, '7d': null, '30d': null }, 'app-a', ALL_WINDOWS)
  assert.deepEqual(badges, [])
})

// ── zero active wallets gate ──────────────────────────────────────────────────

console.log('\ncomputeRankBadges — zero active wallets gate')

ok('app with 0 active wallets produces no badge', () => {
  const list = [wm('app-a', 0, 10), wm('app-b', 5)]
  const badges = computeRankBadges({ '24h': list }, 'app-a', ['24h'])
  assert.deepEqual(badges, [])
})

ok('no placeholder #0 badge emitted', () => {
  const list = [wm('app-a', 0), wm('app-b', 3)]
  const badges = computeRankBadges({ '24h': list }, 'app-a', ['24h'])
  assert.ok(badges.every(b => b.rank !== 0), 'rank 0 must never appear')
  assert.deepEqual(badges, [])
})

// ── app missing from list gate ────────────────────────────────────────────────

console.log('\ncomputeRankBadges — app missing from list')

ok('app not present in window data produces no badge', () => {
  const list = [wm('app-b', 5), wm('app-c', 3)]
  const badges = computeRankBadges({ '24h': list }, 'app-a', ['24h'])
  assert.deepEqual(badges, [])
})

// ── rank calculation ──────────────────────────────────────────────────────────

console.log('\ncomputeRankBadges — rank calculation')

ok('single app list: rank 1 of 1', () => {
  const list = [wm('app-a', 7)]
  const [badge] = computeRankBadges({ '24h': list }, 'app-a', ['24h'])
  assert.equal(badge.rank, 1)
  assert.equal(badge.of, 1)
})

ok('3 apps: correct rank for each', () => {
  const list = [
    wm('app-a', 5),
    wm('app-b', 10),
    wm('app-c', 3),
  ]
  // sorted desc by wallets: app-b(10), app-a(5), app-c(3)
  const b = (key: string) =>
    computeRankBadges({ '24h': list }, key, ['24h'])[0]
  assert.equal(b('app-b').rank, 1)
  assert.equal(b('app-a').rank, 2)
  assert.equal(b('app-c').rank, 3)
  assert.equal(b('app-a').of, 3)
})

ok('"of" equals total apps in the window list', () => {
  const list = [wm('app-a', 10), wm('app-b', 8), wm('app-c', 6), wm('app-d', 4)]
  const [badge] = computeRankBadges({ '24h': list }, 'app-b', ['24h'])
  assert.equal(badge.of, 4)
})

// ── tie-break rule ────────────────────────────────────────────────────────────

console.log('\ncomputeRankBadges — tie-break rule')

ok('tie in activeWallets: higher txCount wins (lower rank number)', () => {
  // app-a and app-b both have 5 active wallets; app-b has more txs → ranks higher
  const list = [
    wm('app-a', 5, 10),
    wm('app-b', 5, 20),
    wm('app-c', 3, 0),
  ]
  const ba = computeRankBadges({ '24h': list }, 'app-a', ['24h'])[0]
  const bb = computeRankBadges({ '24h': list }, 'app-b', ['24h'])[0]
  assert.equal(bb.rank, 1, 'app-b (more txs) should be rank 1')
  assert.equal(ba.rank, 2, 'app-a (fewer txs) should be rank 2')
})

ok('tie in activeWallets AND txCount: appKey ascending breaks the tie', () => {
  // both wallets=5, txs=10; 'alpha' < 'zeta' lexicographically → alpha ranks higher
  const list = [
    wm('zeta', 5, 10),
    wm('alpha', 5, 10),
    wm('app-c', 3, 0),
  ]
  const balpha = computeRankBadges({ '24h': list }, 'alpha', ['24h'])[0]
  const bzeta  = computeRankBadges({ '24h': list }, 'zeta',  ['24h'])[0]
  assert.equal(balpha.rank, 1, '"alpha" sorts before "zeta"')
  assert.equal(bzeta.rank,  2)
})

ok('ties: no two apps share the same rank', () => {
  const list = [
    wm('app-a', 5, 10),
    wm('app-b', 5, 10),
    wm('app-c', 5, 10),
  ]
  const ranks = ['app-a', 'app-b', 'app-c'].map(
    key => computeRankBadges({ '24h': list }, key, ['24h'])[0].rank,
  )
  assert.deepEqual(ranks.sort((a, b) => a - b), [1, 2, 3])
})

// ── multiple windows ──────────────────────────────────────────────────────────

console.log('\ncomputeRankBadges — multiple windows')

ok('returns one badge per allowed+usable window', () => {
  const list24h = [wm('app-a', 5), wm('app-b', 3)]
  const list7d  = [wm('app-a', 8), wm('app-b', 2)]
  const badges = computeRankBadges(
    { '24h': list24h, '7d': list7d },
    'app-a',
    ['24h', '7d'],
  )
  assert.equal(badges.length, 2)
  assert.ok(badges.some(b => b.window === '24h'))
  assert.ok(badges.some(b => b.window === '7d'))
})

ok('window where app has 0 wallets is skipped, others still appear', () => {
  const list24h = [wm('app-a', 0), wm('app-b', 5)]  // app-a has 0 wallets in 24h
  const list7d  = [wm('app-a', 4), wm('app-b', 2)]
  const badges = computeRankBadges(
    { '24h': list24h, '7d': list7d },
    'app-a',
    ['24h', '7d'],
  )
  assert.equal(badges.length, 1)
  assert.equal(badges[0].window, '7d')
})

ok('no badges at all when nothing is available', () => {
  const badges = computeRankBadges({}, 'app-a', ALL_WINDOWS)
  assert.deepEqual(badges, [])
})

// ── done ──────────────────────────────────────────────────────────────────────

console.log(`\nAll ${passed} assertions passed.`)
