// Tests for walletsPrefix(networkId, estimated)
// Run: node --experimental-strip-types --no-warnings src/lib/walletsPrefix.test.ts

import assert from 'node:assert/strict'
import { walletsPrefix } from './walletsPrefix.ts'

let passed = 0
let total = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  ✓ ${label}`)
    passed++
  } catch {
    console.error(`  ✗ ${label}  (actual: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`)
  }
}

// ---------------------------------------------------------------------------
// Mainnet id 5042: always '≤', regardless of estimated flag
// ---------------------------------------------------------------------------

console.log('\nmainnet (5042)')
check('5042, estimated=true  -> ≤', walletsPrefix(5042, true),  '≤')
check('5042, estimated=false -> ≤', walletsPrefix(5042, false), '≤')

// ---------------------------------------------------------------------------
// Testnet id 5042002: estimated -> '≥', exact -> ''
// ---------------------------------------------------------------------------

console.log('\ntestnet (5042002)')
check('5042002, estimated=true  -> ≥', walletsPrefix(5042002, true),  '≥')
check('5042002, estimated=false -> ',  walletsPrefix(5042002, false), '')

// ---------------------------------------------------------------------------
// Unknown / other network id: same rule as testnet
// ---------------------------------------------------------------------------

console.log('\nunknown id (1)')
check('1, estimated=true  -> ≥', walletsPrefix(1, true),  '≥')
check('1, estimated=false -> ',  walletsPrefix(1, false), '')

console.log('\nunknown id (0)')
check('0, estimated=true  -> ≥', walletsPrefix(0, true),  '≥')
check('0, estimated=false -> ',  walletsPrefix(0, false), '')

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed}/${total} tests passed`)
if (passed < total) process.exit(1)
