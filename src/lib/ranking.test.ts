/**
 * Unit tests for src/lib/ranking.ts
 * Run:  node --experimental-strip-types --no-warnings src/lib/ranking.test.ts
 */
import assert from 'node:assert/strict'
import type { AppMetrics } from './appMetrics.ts'
import { sortValue, rankApps, sumTotals } from './ranking.ts'
import type { SortKey } from './ranking.ts'

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0
function ok(label: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${label}`)
}

/** Build a minimal AppMetrics with every field present. */
function m(overrides: Partial<AppMetrics> = {}): AppMetrics {
  return {
    txCount: 0,
    activeWallets: 0,
    volume: 0,
    tvl: 0,
    usdcFees: 0,
    rankChange: 0,
    trend: null,
    estimated: false,
    ...overrides,
  }
}

/** Build a Scorable item. */
function item(
  id: string,
  kind: 'app' | 'asset',
  category: string,
  metrics: Partial<AppMetrics> = {},
) {
  return { app: { id, kind, category }, metrics: m(metrics) }
}

// ── sortValue ─────────────────────────────────────────────────────────────────

console.log('\nsortValue')

const SORT_KEYS: SortKey[] = ['txCount', 'activeWallets', 'volume', 'tvl', 'usdcFees']

for (const key of SORT_KEYS) {
  ok(`${key}: returns the value when set`, () => {
    assert.equal(sortValue(m({ [key]: 42 }), key), 42)
  })

  ok(`${key}: null becomes -1`, () => {
    assert.equal(sortValue(m({ [key]: null as unknown as never }), key), -1)
  })

  ok(`${key}: 0 stays 0 (ranks above null/-1)`, () => {
    const sv = sortValue(m({ [key]: 0 }), key)
    assert.equal(sv, 0)
    assert.ok(sv > sortValue(m({ [key]: null as unknown as never }), key))
  })
}

ok('txCount: positive integer', () => assert.equal(sortValue(m({ txCount: 999 }), 'txCount'), 999))
ok('volume: fractional value', () => assert.equal(sortValue(m({ volume: 1.5 }), 'volume'), 1.5))

// ── rankApps ─────────────────────────────────────────────────────────────────

console.log('\nrankApps — sort order')

const ALL_FILTER = { kind: 'all' as const, category: 'All' }

// Descending sort for each of the five keys
const SORT_CASES: Array<{ key: SortKey; values: Array<number | null>; expectedOrder: string[] }> = [
  { key: 'txCount',      values: [10, 30, 20],        expectedOrder: ['b', 'c', 'a'] },
  { key: 'activeWallets',values: [5, 1, 3],           expectedOrder: ['a', 'c', 'b'] },
  { key: 'volume',       values: [100, null, 50],      expectedOrder: ['a', 'c', 'b'] },
  { key: 'tvl',          values: [0, null, 200],       expectedOrder: ['c', 'a', 'b'] },
  { key: 'usdcFees',     values: [null, 7, 3],         expectedOrder: ['b', 'c', 'a'] },
]

for (const { key, values, expectedOrder } of SORT_CASES) {
  ok(`${key}: sorts descending`, () => {
    const ids = ['a', 'b', 'c']
    const items = ids.map((id, i) =>
      item(id, 'app', 'DeFi', { [key]: values[i] }),
    )
    const { items: ranked } = rankApps(items, key, ALL_FILTER, null)
    assert.deepEqual(ranked.map(r => r.app.id), expectedOrder)
  })
}

ok('null values sink below zeros', () => {
  const items = [
    item('zero', 'app', 'X', { volume: 0 }),
    item('null', 'app', 'X', { volume: null }),
    item('pos',  'app', 'X', { volume: 5 }),
  ]
  const { items: ranked } = rankApps(items, 'volume', ALL_FILTER, null)
  assert.deepEqual(ranked.map(r => r.app.id), ['pos', 'zero', 'null'])
})

ok('ties keep input order (stable)', () => {
  // All have the same txCount — output order must equal input order.
  const items = [
    item('first',  'app', 'X', { txCount: 10 }),
    item('second', 'app', 'X', { txCount: 10 }),
    item('third',  'app', 'X', { txCount: 10 }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', ALL_FILTER, null)
  assert.deepEqual(ranked.map(r => r.app.id), ['first', 'second', 'third'])
})

ok('input array is not mutated', () => {
  const items = [
    item('x', 'app', 'X', { txCount: 5 }),
    item('y', 'app', 'X', { txCount: 20 }),
  ]
  const before = items.map(i => i.app.id)
  rankApps(items, 'txCount', ALL_FILTER, null)
  assert.deepEqual(items.map(i => i.app.id), before)
})

console.log('\nrankApps — ranksAll and rank numbering')

ok('ranksAll numbers the WHOLE list 1..n', () => {
  const items = [
    item('a', 'app',   'DeFi', { txCount: 30 }),
    item('b', 'asset', 'NFT',  { txCount: 20 }),
    item('c', 'app',   'NFT',  { txCount: 10 }),
  ]
  // Filter hides tokens — only 'app' kind
  const { ranksAll } = rankApps(items, 'txCount', { kind: 'app', category: 'All' }, null)
  // All three items are ranked in ranksAll regardless of filter
  assert.equal(ranksAll['a'], 1)
  assert.equal(ranksAll['b'], 2)
  assert.equal(ranksAll['c'], 3)
})

ok('rank numbers only the visible items 1..m', () => {
  const items = [
    item('a', 'app',   'DeFi', { txCount: 30 }),
    item('b', 'asset', 'NFT',  { txCount: 20 }),
    item('c', 'app',   'NFT',  { txCount: 10 }),
  ]
  // Filter: kind=app => only 'a' and 'c' visible
  const { items: ranked } = rankApps(items, 'txCount', { kind: 'app', category: 'All' }, null)
  assert.deepEqual(ranked.map(r => r.app.id), ['a', 'c'])
  assert.equal(ranked[0].rank, 1)
  assert.equal(ranked[1].rank, 2)
})

console.log('\nrankApps — filters')

ok('kind filter: "app" keeps only app kind', () => {
  const items = [
    item('a', 'app',    'X', { txCount: 10 }),
    item('b', 'asset',  'X', { txCount: 20 }),
    item('c', 'asset', 'X', { txCount: 5  }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', { kind: 'app', category: 'All' }, null)
  assert.deepEqual(ranked.map(r => r.app.id), ['a'])
})

ok('kind filter: "all" keeps every kind', () => {
  const items = [
    item('a', 'app',    'X', { txCount: 10 }),
    item('b', 'asset',  'X', { txCount: 20 }),
    item('c', 'asset', 'X', { txCount: 5  }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', { kind: 'all', category: 'All' }, null)
  assert.equal(ranked.length, 3)
})

ok('kind filter: undefined keeps every kind', () => {
  const items = [
    item('a', 'app',   'X', { txCount: 10 }),
    item('b', 'asset', 'X', { txCount: 20 }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', { kind: undefined, category: 'All' }, null)
  assert.equal(ranked.length, 2)
})

ok('category filter: "All" keeps every category', () => {
  const items = [
    item('a', 'app', 'DeFi', { txCount: 10 }),
    item('b', 'app', 'NFT',  { txCount: 20 }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', { kind: 'all', category: 'All' }, null)
  assert.equal(ranked.length, 2)
})

ok('category filter: named category keeps only matching items', () => {
  const items = [
    item('a', 'app', 'DeFi', { txCount: 10 }),
    item('b', 'app', 'NFT',  { txCount: 20 }),
    item('c', 'app', 'DeFi', { txCount: 5  }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', { kind: 'all', category: 'DeFi' }, null)
  assert.deepEqual(ranked.map(r => r.app.id), ['a', 'c'])
})

ok('kind and category filters combine (AND)', () => {
  const items = [
    item('a', 'app',   'DeFi', { txCount: 30 }),
    item('b', 'asset', 'DeFi', { txCount: 20 }),
    item('c', 'app',   'NFT',  { txCount: 10 }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', { kind: 'app', category: 'DeFi' }, null)
  assert.deepEqual(ranked.map(r => r.app.id), ['a'])
})

console.log('\nrankApps — rankChange')

ok('prevRanks null → 0 for everyone', () => {
  const items = [
    item('a', 'app', 'X', { txCount: 20 }),
    item('b', 'app', 'X', { txCount: 10 }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', ALL_FILTER, null)
  for (const r of ranked) assert.equal(r.metrics.rankChange, 0)
})

ok('app missing from prevRanks → 0', () => {
  const items = [
    item('a', 'app', 'X', { txCount: 20 }),
    item('b', 'app', 'X', { txCount: 10 }),
  ]
  // 'b' has no entry in prevRanks
  const { items: ranked } = rankApps(items, 'txCount', ALL_FILTER, { a: 1 })
  const b = ranked.find(r => r.app.id === 'b')!
  assert.equal(b.metrics.rankChange, 0)
})

ok('previous rank 5 now 2 → +3 (moved up)', () => {
  // Build items so 'a' ends up at rank 2 after sort.
  // Sorted descending by txCount: z=100, a=90, c=80, d=70, e=60
  //                               rank:  1     2     3     4     5
  const items = [
    item('z', 'app', 'X', { txCount: 100 }),
    item('a', 'app', 'X', { txCount: 90  }),
    item('c', 'app', 'X', { txCount: 80  }),
    item('d', 'app', 'X', { txCount: 70  }),
    item('e', 'app', 'X', { txCount: 60  }),
  ]
  const prevRanks = { z: 1, a: 5, c: 3, d: 4, e: 2 }
  const { items: ranked } = rankApps(items, 'txCount', ALL_FILTER, prevRanks)
  const a = ranked.find(r => r.app.id === 'a')!
  // before=5, ranksAll['a']=2 → change = 5 - 2 = +3
  assert.equal(a.metrics.rankChange, 3)
})

ok('previous rank 2 now 5 → -3 (moved down)', () => {
  const items = [
    item('z', 'app', 'X', { txCount: 100 }),
    item('a', 'app', 'X', { txCount: 90  }),
    item('c', 'app', 'X', { txCount: 80  }),
    item('d', 'app', 'X', { txCount: 70  }),
    item('e', 'app', 'X', { txCount: 60  }),
  ]
  // 'e' is now rank 5, was rank 2 before
  const prevRanks = { z: 1, a: 4, c: 3, d: 5, e: 2 }
  const { items: ranked } = rankApps(items, 'txCount', ALL_FILTER, prevRanks)
  const e = ranked.find(r => r.app.id === 'e')!
  // before=2, ranksAll['e']=5 → change = 2 - 5 = -3
  assert.equal(e.metrics.rankChange, -3)
})

ok('unchanged rank → 0', () => {
  const items = [
    item('a', 'app', 'X', { txCount: 20 }),
    item('b', 'app', 'X', { txCount: 10 }),
  ]
  const { items: ranked } = rankApps(items, 'txCount', ALL_FILTER, { a: 1, b: 2 })
  for (const r of ranked) assert.equal(r.metrics.rankChange, 0)
})

ok('rankChange uses whole-list rank (ranksAll), not filtered rank', () => {
  // Items: a(txCount=30), b(txCount=20,kind=token), c(txCount=10)
  // Sorted whole list: a=rank1, b=rank2, c=rank3
  // Filter: kind='app' → only a and c visible; a.rank=1, c.rank=2
  // prevRanks: c was rank 2 in whole list previously
  // Now c's ranksAll = 3 → change = 2 - 3 = -1 (based on whole-list rank)
  // If it were based on filtered rank (2→2) the change would be 0 — assert it is -1.
  const items = [
    item('a', 'app',   'X', { txCount: 30 }),
    item('b', 'asset', 'X', { txCount: 20 }),
    item('c', 'app',   'X', { txCount: 10 }),
  ]
  const prevRanks = { a: 1, b: 1, c: 2 }
  const { items: ranked, ranksAll } = rankApps(items, 'txCount', { kind: 'app', category: 'All' }, prevRanks)
  // Verify ranksAll agrees with our calculation
  assert.equal(ranksAll['a'], 1)
  assert.equal(ranksAll['b'], 2)
  assert.equal(ranksAll['c'], 3)
  const c = ranked.find(r => r.app.id === 'c')!
  // c's filtered rank is 2, its whole-list rank is 3; prev whole-list rank was 2 → change = 2-3 = -1
  assert.equal(c.rank, 2)                     // filtered rank
  assert.equal(c.metrics.rankChange, -1)      // based on ranksAll, not filtered rank
})

ok('previous rank 0 counts as "no previous" → 0', () => {
  // 0 is falsy in JS: `before ? before - ranksAll[id] : 0` → 0
  const items = [item('a', 'app', 'X', { txCount: 10 })]
  const { items: ranked } = rankApps(items, 'txCount', ALL_FILTER, { a: 0 })
  assert.equal(ranked[0].metrics.rankChange, 0)
})

ok('original metrics object is not mutated (rankChange set on copy)', () => {
  const original = m({ txCount: 10, rankChange: 99 })
  const items = [{ app: { id: 'a', kind: 'app' as const, category: 'X' }, metrics: original }]
  rankApps(items, 'txCount', ALL_FILTER, { a: 3 })
  // original.rankChange must still be 99
  assert.equal(original.rankChange, 99)
})

ok('empty input gives empty items and empty ranksAll', () => {
  const { items: ranked, ranksAll } = rankApps([], 'txCount', ALL_FILTER, null)
  assert.deepEqual(ranked, [])
  assert.deepEqual(ranksAll, {})
})

// ── sumTotals ─────────────────────────────────────────────────────────────────

console.log('\nsumTotals')

ok('sums volume, activeWallets, txCount, tvl', () => {
  const items = [
    { metrics: m({ txCount: 10, activeWallets: 5, volume: 100, tvl: 200 }) },
    { metrics: m({ txCount: 20, activeWallets: 3, volume: 50,  tvl: 300 }) },
  ]
  const totals = sumTotals(items)
  assert.equal(totals.txCount,       30)
  assert.equal(totals.activeWallets, 8)
  assert.equal(totals.volume,        150)
  assert.equal(totals.tvl,           500)
})

ok('null volume counts as 0', () => {
  const items = [
    { metrics: m({ volume: 100 }) },
    { metrics: m({ volume: null }) },
    { metrics: m({ volume: 50  }) },
  ]
  assert.equal(sumTotals(items).volume, 150)
})

ok('null tvl counts as 0', () => {
  const items = [
    { metrics: m({ tvl: 200 }) },
    { metrics: m({ tvl: null }) },
    { metrics: m({ tvl: 100 }) },
  ]
  assert.equal(sumTotals(items).tvl, 300)
})

ok('both volume and tvl null gives 0 for both', () => {
  const items = [{ metrics: m({ volume: null, tvl: null }) }]
  const totals = sumTotals(items)
  assert.equal(totals.volume, 0)
  assert.equal(totals.tvl,    0)
})

ok('empty list gives all zeros', () => {
  const totals = sumTotals([])
  assert.equal(totals.volume,        0)
  assert.equal(totals.activeWallets, 0)
  assert.equal(totals.txCount,       0)
  assert.equal(totals.tvl,           0)
})

ok('single item: totals equal the item', () => {
  const items = [{ metrics: m({ txCount: 7, activeWallets: 3, volume: 42, tvl: 99 }) }]
  const totals = sumTotals(items)
  assert.equal(totals.txCount,       7)
  assert.equal(totals.activeWallets, 3)
  assert.equal(totals.volume,        42)
  assert.equal(totals.tvl,           99)
})

ok('does not include usdcFees or rankChange in output', () => {
  const totals = sumTotals([{ metrics: m({ usdcFees: 999, rankChange: 99 }) }])
  assert.ok(!('usdcFees'   in totals))
  assert.ok(!('rankChange' in totals))
})

// ── done ─────────────────────────────────────────────────────────────────────

console.log(`\nAll ${passed} assertions passed.`)
