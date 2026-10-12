// run: node --experimental-strip-types --no-warnings src/lib/walletLevels.test.ts

import assert from 'node:assert/strict'
import { HIGH_FREQUENCY, buildLevels } from './walletLevels.ts'

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------
let passed = 0
let total = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    passed++
  } catch (err) {
    const e = err as { message?: string }
    console.error(`  FAIL  ${label}`)
    console.error(`        ${e.message ?? String(err)}`)
  }
}

console.log('\n=== walletLevels / HIGH_FREQUENCY + buildLevels ===\n')

// ---------------------------------------------------------------------------
// 1. HIGH_FREQUENCY constant
// ---------------------------------------------------------------------------
check('HIGH_FREQUENCY is 10000', HIGH_FREQUENCY, 10_000)

// ---------------------------------------------------------------------------
// 2. Address keys are lower-cased in levels
// ---------------------------------------------------------------------------
{
  const { levels } = buildLevels(['0xABCDEF'], [5])
  check('address key is lower-cased', levels.has('0xabcdef'), true)
  check('original-case key absent', levels.has('0xABCDEF'), false)
}

// ---------------------------------------------------------------------------
// 3. Count aligned by index
// ---------------------------------------------------------------------------
{
  const addrs = ['0xAAAA', '0xBBBB', '0xCCCC'] as const
  const counts = [1, 2, 3] as const
  const { levels } = buildLevels(addrs, counts)
  check('first address count', levels.get('0xaaaa'), 1)
  check('second address count', levels.get('0xbbbb'), 2)
  check('third address count', levels.get('0xcccc'), 3)
}

// ---------------------------------------------------------------------------
// 4. undefined count (still loading) -> address absent from levels and flagged
// ---------------------------------------------------------------------------
{
  const { levels, flagged } = buildLevels(['0xLOADING'], [undefined])
  check('undefined count: absent from levels', levels.has('0xloading'), false)
  check('undefined count: not flagged', flagged.has('0xloading'), false)
}

// ---------------------------------------------------------------------------
// 5. Count exactly HIGH_FREQUENCY -> flagged; one below -> not flagged
// ---------------------------------------------------------------------------
{
  const { flagged: flaggedExact } = buildLevels(['0xEXACT'], [10_000])
  check('count exactly HIGH_FREQUENCY -> flagged', flaggedExact.has('0xexact'), true)

  const { flagged: flaggedBelow } = buildLevels(['0xBELOW'], [9_999])
  check('count 9999 -> not flagged', flaggedBelow.has('0xbelow'), false)
}

// ---------------------------------------------------------------------------
// 6. Count 0 -> not flagged but present in levels
// ---------------------------------------------------------------------------
{
  const { levels, flagged } = buildLevels(['0xZERO'], [0])
  check('count 0: present in levels', levels.get('0xzero'), 0)
  check('count 0: not flagged', flagged.has('0xzero'), false)
}

// ---------------------------------------------------------------------------
// 7. flagged is a subset of levels keys and contains lower-cased addresses
// ---------------------------------------------------------------------------
{
  const addrs = ['0xAA', '0xBB', '0xCC'] as const
  const counts = [10_000, 500, 20_000] as const
  const { levels, flagged } = buildLevels(addrs, counts)

  const flaggedArr = [...flagged]
  const allInLevels: boolean = flaggedArr.every(a => levels.has(a))
  check('flagged is a subset of levels keys', allInLevels, true)

  const allLower: boolean = flaggedArr.every(a => a === a.toLowerCase())
  check('flagged contains lower-cased addresses', allLower, true)
}

// ---------------------------------------------------------------------------
// 8. Mixed-case duplicate address -> one key, later count wins
// ---------------------------------------------------------------------------
{
  // Same address provided twice with different casing; second count should win.
  const { levels } = buildLevels(['0xDupe', '0xDUPE'], [11, 22])
  check('duplicate mixed-case: only one key', levels.size, 1)
  check('duplicate mixed-case: later count wins', levels.get('0xdupe'), 22)
}

// ---------------------------------------------------------------------------
// 9. Counts array shorter than addresses -> missing treated as undefined
// ---------------------------------------------------------------------------
{
  const { levels, flagged } = buildLevels(['0xA1', '0xB2', '0xC3'], [5])
  // Only index 0 has a real count; 1 and 2 have counts[i] === undefined
  check('only present count in levels (length 1)', levels.size, 1)
  check('present address count correct', levels.get('0xa1'), 5)
  check('missing-count address absent', levels.has('0xb2'), false)
  check('missing-count address not flagged', flagged.has('0xc3'), false)
}

// ---------------------------------------------------------------------------
// 10. Empty inputs -> empty Map and empty Set
// ---------------------------------------------------------------------------
{
  const { levels, flagged } = buildLevels([], [])
  check('empty inputs: levels is empty Map', levels.size, 0)
  check('empty inputs: flagged is empty Set', flagged.size, 0)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed}/${total} tests passed\n`)
if (passed < total) process.exit(1)
