/**
 * Unit tests for src/lib/shares.ts
 *
 * Run from repo root:
 *   node --experimental-strip-types --no-warnings src/lib/shares.test.ts
 */

import assert from 'node:assert/strict'
import type { AppCategory } from '@/data/apps'
import { categoryShares, balanceShares } from './shares.ts'

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0
let total = 0

function check<T>(label: string, actual: T, expected: T): void {
  total++
  try {
    assert.deepEqual(actual, expected)
    console.log(`  ✓ ${label}`)
    passed++
  } catch {
    console.error(`  ✗ ${label}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
  }
}

/** Floating-point near-equality (|a-b| < 1e-9). */
function near(label: string, actual: number, expected: number): void {
  total++
  if (Math.abs(actual - expected) < 1e-9) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    actual:   ${actual}`)
    console.error(`    expected: ${expected}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal item for categoryShares. */
function cat(category: string, txCount: number) {
  return {
    app: { category: category as AppCategory },
    metrics: { txCount },
  }
}

// ---------------------------------------------------------------------------
// categoryShares
// ---------------------------------------------------------------------------

console.log('\n--- categoryShares: empty input ---')

check('empty input -> []', categoryShares([]), [])

console.log('\n--- categoryShares: single category ---')
{
  const result = categoryShares([cat('DeFi', 50)])
  check('single category: length 1', result.length, 1)
  check('single category: tx count', result[0].tx, 50)
  near('single category: pct = 100', result[0].pct, 100)
}

console.log('\n--- categoryShares: all-zero txCount ---')
{
  const result = categoryShares([cat('DeFi', 0), cat('Infra', 0)])
  check('all-zero: length 2', result.length, 2)
  for (const r of result) {
    near(`all-zero: ${r.category} pct is 0 (no NaN)`, r.pct, 0)
    check(`all-zero: ${r.category} pct is finite`, isFinite(r.pct), true)
  }
}

console.log('\n--- categoryShares: category with 0 tx still listed ---')
{
  const result = categoryShares([cat('DeFi', 100), cat('Infra', 0)])
  check('zero-tx category still in result', result.length, 2)
  const nft = result.find(r => r.category === 'Infra')
  check('Infra entry exists', nft !== undefined, true)
  near('Infra pct = 0', nft!.pct, 0)
}

console.log('\n--- categoryShares: sums txCount per category ---')
{
  // Two items in the same category
  const result = categoryShares([
    cat('DeFi', 30),
    cat('DeFi', 70),
    cat('Infra', 50),
  ])
  check('merged categories: length 2', result.length, 2)
  const defi = result.find(r => r.category === 'DeFi')!
  check('DeFi tx = 100', defi.tx, 100)
  near('DeFi pct = 66.666...', defi.pct, (100 / 150) * 100)
}

console.log('\n--- categoryShares: sorted descending by tx ---')
{
  const result = categoryShares([
    cat('Infra', 10),
    cat('DeFi', 40),
    cat('Social', 25),
  ])
  check('first is DeFi (most tx)', result[0].category, 'DeFi')
  check('second is Social', result[1].category, 'Social')
  check('third is NFT', result[2].category, 'Infra')
}

console.log('\n--- categoryShares: pcts sum to 100 (non-empty, non-all-zero) ---')
{
  const result = categoryShares([
    cat('DeFi', 40),
    cat('Infra', 35),
    cat('Social', 25),
  ])
  const sum = result.reduce((s, r) => s + r.pct, 0)
  near('pct sum = 100', sum, 100)
}

console.log('\n--- categoryShares: ties keep first-seen order ---')
{
  // Two categories with equal tx — they should appear in insertion (Map) order
  const result = categoryShares([
    cat('Alpha', 50),
    cat('Beta', 50),
  ])
  check('tied: Alpha first (first-seen)', result[0].category, 'Alpha')
  check('tied: Beta second', result[1].category, 'Beta')
}

// ---------------------------------------------------------------------------
// balanceShares
// ---------------------------------------------------------------------------

console.log('\n--- balanceShares: drops value <= 0 ---')
{
  const input = [
    { key: 'a', name: 'A', value: 0 },
    { key: 'b', name: 'B', value: -5 },
    { key: 'c', name: 'C', value: 10 },
  ]
  const result = balanceShares(input)
  check('only positive values kept', result.length, 1)
  check('kept entry is C', result[0].key, 'c')
}

console.log('\n--- balanceShares: all dropped -> [] ---')
{
  const result = balanceShares([{ value: 0 }, { value: -1 }])
  check('all non-positive -> []', result, [])
}

console.log('\n--- balanceShares: sorted descending ---')
{
  const result = balanceShares([
    { key: 'a', value: 10 },
    { key: 'b', value: 30 },
    { key: 'c', value: 20 },
  ])
  check('first is b (value 30)', result[0].key, 'b')
  check('second is c (value 20)', result[1].key, 'c')
  check('third is a (value 10)', result[2].key, 'a')
}

console.log('\n--- balanceShares: pct of total ---')
{
  const result = balanceShares([
    { key: 'a', value: 25 },
    { key: 'b', value: 75 },
  ])
  near('b pct = 75', result[0].pct, 75)
  near('a pct = 25', result[1].pct, 25)
  near('pct sum = 100', result[0].pct + result[1].pct, 100)
}

console.log('\n--- balanceShares: single entry -> pct 100 ---')
{
  const result = balanceShares([{ value: 42 }])
  near('single entry pct = 100', result[0].pct, 100)
}

console.log('\n--- balanceShares: extra fields preserved ---')
{
  const result = balanceShares([
    { key: 'eth', name: 'Ethereum', value: 60, chainId: 1 },
    { key: 'usdc', name: 'USDC', value: 40, chainId: 8453 },
  ])
  check('extra key field preserved', result[0].key, 'eth')
  check('extra name field preserved', result[0].name, 'Ethereum')
  check('extra chainId field preserved (eth)', result[0].chainId, 1)
  check('extra chainId field preserved (usdc)', result[1].chainId, 8453)
}

console.log('\n--- balanceShares: input array not mutated ---')
{
  const input = [
    { value: 10 },
    { value: 50 },
    { value: 30 },
  ]
  // Capture original order
  const originalOrder = input.map(x => x.value)
  balanceShares(input)
  const afterOrder = input.map(x => x.value)
  check('input order unchanged after call', afterOrder, originalOrder)
}

console.log('\n--- balanceShares: three-way pct check ---')
{
  const result = balanceShares([
    { value: 10 },
    { value: 20 },
    { value: 70 },
  ])
  near('70-value pct = 70', result[0].pct, 70)
  near('20-value pct = 20', result[1].pct, 20)
  near('10-value pct = 10', result[2].pct, 10)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nshares.test.ts: ${passed}/${total} passed`)
if (passed < total) process.exit(1)
