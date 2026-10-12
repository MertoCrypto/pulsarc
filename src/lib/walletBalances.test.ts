// Unit tests for keepReadBalances(tokens, results)
// Run: node --experimental-strip-types --no-warnings src/lib/walletBalances.test.ts

import assert from 'node:assert/strict'
import { keepReadBalances } from './walletBalances.ts'
import type { TokenBalance } from './walletBalances.ts'

// ---------------------------------------------------------------------------
// Minimal harness
// ---------------------------------------------------------------------------

let passed = 0
let total = 0

function check<T>(label: string, actual: T, expected: T): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  ✓ ${label}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${label}`)
    if (err instanceof assert.AssertionError) {
      console.error(`    actual:   ${JSON.stringify(actual, (_k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v))}`)
      console.error(`    expected: ${JSON.stringify(expected, (_k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v))}`)
    } else {
      console.error(err)
    }
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fulfilled(value: TokenBalance): PromiseFulfilledResult<TokenBalance> {
  return { status: 'fulfilled', value }
}

function rejected(reason = 'rpc error'): PromiseRejectedResult {
  return { status: 'rejected', reason }
}

const T_A: TokenBalance = { id: 'USDC', raw: 1_000_000n, decimals: 6 }
const T_B: TokenBalance = { id: 'ETH', raw: 2_000_000_000_000_000_000n, decimals: 18 }
const T_C: TokenBalance = { id: 'DAI', raw: 500n, decimals: 3 }

// ---------------------------------------------------------------------------
// Test: all fulfilled → same objects in same order
// ---------------------------------------------------------------------------

console.log('\nall fulfilled')
{
  const tokens = [{ id: 'USDC' }, { id: 'ETH' }, { id: 'DAI' }]
  const results = [fulfilled(T_A), fulfilled(T_B), fulfilled(T_C)]
  const out = keepReadBalances(tokens, results)

  check('length is 3', out.length, 3)
  check('element 0 deepEqual T_A', out[0], T_A)
  check('element 1 deepEqual T_B', out[1], T_B)
  check('element 2 deepEqual T_C', out[2], T_C)

  // same object references (identity)
  total++
  if (out[0] === T_A && out[1] === T_B && out[2] === T_C) {
    console.log('  ✓ all results are same object references')
    passed++
  } else {
    console.error('  ✗ all results are same object references')
  }
}

// ---------------------------------------------------------------------------
// Test: all rejected → []
// ---------------------------------------------------------------------------

console.log('\nall rejected')
{
  const tokens = [{ id: 'USDC' }, { id: 'ETH' }]
  const results = [rejected(), rejected('timeout')]
  const out = keepReadBalances(tokens, results)

  check('returns empty array', out, [])
}

// ---------------------------------------------------------------------------
// Test: mixed → only fulfilled kept, order preserved by original position
// ---------------------------------------------------------------------------

console.log('\nmixed fulfilled and rejected')
{
  const tokens = [{ id: 'USDC' }, { id: 'ETH' }, { id: 'DAI' }]
  // positions 0 and 2 fulfilled, position 1 rejected
  const results = [fulfilled(T_A), rejected(), fulfilled(T_C)]
  const out = keepReadBalances(tokens, results)

  check('length is 2', out.length, 2)
  check('first kept element is T_A (position 0)', out[0], T_A)
  check('second kept element is T_C (position 2)', out[1], T_C)

  // identity checks
  total++
  if (out[0] === T_A && out[1] === T_C) {
    console.log('  ✓ kept items are same object references')
    passed++
  } else {
    console.error('  ✗ kept items are same object references')
  }
}

// ---------------------------------------------------------------------------
// Test: mixed with first rejected
// ---------------------------------------------------------------------------

console.log('\nmixed: first rejected, rest fulfilled')
{
  const tokens = [{ id: 'USDC' }, { id: 'ETH' }, { id: 'DAI' }]
  const results = [rejected(), fulfilled(T_B), fulfilled(T_C)]
  const out = keepReadBalances(tokens, results)

  check('length is 2', out.length, 2)
  check('element 0 is T_B', out[0], T_B)
  check('element 1 is T_C', out[1], T_C)
}

// ---------------------------------------------------------------------------
// Test: mixed with last rejected
// ---------------------------------------------------------------------------

console.log('\nmixed: last rejected')
{
  const tokens = [{ id: 'USDC' }, { id: 'ETH' }, { id: 'DAI' }]
  const results = [fulfilled(T_A), fulfilled(T_B), rejected()]
  const out = keepReadBalances(tokens, results)

  check('length is 2', out.length, 2)
  check('element 0 is T_A', out[0], T_A)
  check('element 1 is T_B', out[1], T_B)
}

// ---------------------------------------------------------------------------
// Test: empty tokens and empty results → []
// ---------------------------------------------------------------------------

console.log('\nempty tokens and results')
{
  const out = keepReadBalances([], [])
  check('returns empty array', out, [])
}

// ---------------------------------------------------------------------------
// Test: bigint raw value 0n passes through untouched with its decimals
// ---------------------------------------------------------------------------

console.log('\nbigint raw = 0n')
{
  const zero: TokenBalance = { id: 'ZERO', raw: 0n, decimals: 6 }
  const tokens = [{ id: 'ZERO' }]
  const results = [fulfilled(zero)]
  const out = keepReadBalances(tokens, results)

  check('length is 1', out.length, 1)
  check('raw is 0n', out[0].raw, 0n)
  check('decimals is 6', out[0].decimals, 6)
  check('id is ZERO', out[0].id, 'ZERO')
}

// ---------------------------------------------------------------------------
// Test: bigint raw = 10n**30n passes through untouched with its decimals
// ---------------------------------------------------------------------------

console.log('\nbigint raw = 10n**30n')
{
  const large: TokenBalance = { id: 'LARGE', raw: 10n ** 30n, decimals: 18 }
  const tokens = [{ id: 'LARGE' }]
  const results = [fulfilled(large)]
  const out = keepReadBalances(tokens, results)

  check('length is 1', out.length, 1)
  check('raw is 10n**30n', out[0].raw, 10n ** 30n)
  check('decimals is 18', out[0].decimals, 18)
}

// ---------------------------------------------------------------------------
// Test: fulfilled value whose own fields look like an error (raw 0n, decimals 0) is KEPT
// ---------------------------------------------------------------------------

console.log('\nfulfilled value with error-like fields (raw 0n, decimals 0) is kept')
{
  const errorLike: TokenBalance = { id: 'ERR_LIKE', raw: 0n, decimals: 0 }
  const tokens = [{ id: 'ERR_LIKE' }]
  const results = [fulfilled(errorLike)]
  const out = keepReadBalances(tokens, results)

  check('length is 1 (not dropped)', out.length, 1)
  check('deepEqual errorLike', out[0], errorLike)
}

// ---------------------------------------------------------------------------
// Test: rejected entry never leaks into output — no `error` key in any returned item
// ---------------------------------------------------------------------------

console.log('\nrejected entries do not leak error key into output')
{
  const tokens = [{ id: 'USDC' }, { id: 'ETH' }]
  const results = [fulfilled(T_A), rejected()]
  const out = keepReadBalances(tokens, results)

  check('only one item in output', out.length, 1)

  total++
  const hasErrorKey = out.some(item => 'error' in item)
  if (!hasErrorKey) {
    console.log('  ✓ no item has an error key')
    passed++
  } else {
    console.error('  ✗ at least one item has an error key (leaked)')
  }
}

// ---------------------------------------------------------------------------
// Test: single fulfilled
// ---------------------------------------------------------------------------

console.log('\nsingle fulfilled')
{
  const tokens = [{ id: 'USDC' }]
  const results = [fulfilled(T_A)]
  const out = keepReadBalances(tokens, results)

  check('length is 1', out.length, 1)
  check('deepEqual T_A', out[0], T_A)
}

// ---------------------------------------------------------------------------
// Test: single rejected
// ---------------------------------------------------------------------------

console.log('\nsingle rejected')
{
  const tokens = [{ id: 'USDC' }]
  const results = [rejected()]
  const out = keepReadBalances(tokens, results)

  check('returns empty array', out, [])
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed}/${total} tests passed`)
if (passed < total) {
  process.exit(1)
}
