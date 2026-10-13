/**
 * node --experimental-strip-types --no-warnings src/lib/rankRanges.test.ts
 */
import assert from 'node:assert/strict'
import { disabledRangesFor, isRangeAllowed, type RankRange } from './rankRanges.ts'

const MAINNET = 5042
const TESTNET = 5042002
const UNKNOWN = 1

// disabledRangesFor
assert.deepStrictEqual(disabledRangesFor(MAINNET), ['30d', 'all'], 'mainnet disables 30d and all')
assert.deepStrictEqual(disabledRangesFor(TESTNET), [], 'testnet disables nothing')
assert.deepStrictEqual(disabledRangesFor(UNKNOWN), [], 'unknown id disables nothing')

// isRangeAllowed — mainnet
const allRanges: RankRange[] = ['1h', '24h', '7d', '30d', 'all']

for (const r of allRanges) {
  const expected = r !== '30d' && r !== 'all'
  assert.strictEqual(isRangeAllowed(MAINNET, r), expected, `mainnet isRangeAllowed('${r}') === ${expected}`)
}

// isRangeAllowed — testnet
for (const r of allRanges) {
  assert.strictEqual(isRangeAllowed(TESTNET, r), true, `testnet isRangeAllowed('${r}') === true`)
}

// isRangeAllowed — unknown
for (const r of allRanges) {
  assert.strictEqual(isRangeAllowed(UNKNOWN, r), true, `unknown isRangeAllowed('${r}') === true`)
}

console.log('All rankRanges tests passed.')
