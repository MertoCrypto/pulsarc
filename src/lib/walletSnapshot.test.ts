/**
 * Unit tests for toWalletSnapshot()
 *
 * Run:
 *   node --experimental-strip-types --no-warnings src/lib/walletSnapshot.test.ts
 */

import assert from 'node:assert/strict'
import { toWalletSnapshot, type RawAddress, type RawCounters, type RawTxPage } from './walletSnapshot.ts'

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0
let total = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    passed++
  } catch {
    console.error(`  FAIL  ${label}`)
    console.error(`        actual  : ${JSON.stringify(actual)}`)
    console.error(`        expected: ${JSON.stringify(expected)}`)
  }
}

// ---------------------------------------------------------------------------
// Fixed time anchor
// ---------------------------------------------------------------------------
// nowMs = 2026-01-02T00:00:00Z
const NOW_MS: number = Date.parse('2026-01-02T00:00:00Z')
const SINCE_MS: number = NOW_MS - 24 * 3600_000  // 2026-01-01T00:00:00Z

// Handy ISO helpers (relative to NOW_MS)
const msToIso = (ms: number): string => new Date(ms).toISOString()

// Boundary timestamps
const EXACTLY_SINCE: string = msToIso(SINCE_MS)               // >= since → counts
const ONE_MS_BEFORE_SINCE: string = msToIso(SINCE_MS - 1)     // < since → does NOT count
const ONE_HOUR_AGO: string = msToIso(NOW_MS - 3600_000)       // well inside 24h
const ONE_DAY_AGO_PLUS_1H: string = msToIso(NOW_MS - 25 * 3600_000) // outside 24h
const FUTURE: string = msToIso(NOW_MS + 3600_000)             // future — still counts

// Reusable base fixtures
const BASE_INFO: RawAddress = { coin_balance: null, is_contract: false, name: null }
const BASE_COUNTERS: RawCounters = { transactions_count: '0', token_transfers_count: '0' }
const EMPTY_TXS: RawTxPage = { items: [] }

// ---------------------------------------------------------------------------
// 1. balance: scaled(coin_balance, 18)
// ---------------------------------------------------------------------------
console.log('\n── balance ──────────────────────────────────────────────────')

check(
  'balance: 1500000000000000000 (1e18 * 1.5) -> 1.5',
  toWalletSnapshot('0xABCD', { ...BASE_INFO, coin_balance: '1500000000000000000' }, BASE_COUNTERS, EMPTY_TXS, NOW_MS).balance,
  1.5
)

check(
  'balance: "1000000000000000000" -> 1',
  toWalletSnapshot('0xABCD', { ...BASE_INFO, coin_balance: '1000000000000000000' }, BASE_COUNTERS, EMPTY_TXS, NOW_MS).balance,
  1
)

check(
  'balance: null -> 0',
  toWalletSnapshot('0xABCD', { ...BASE_INFO, coin_balance: null }, BASE_COUNTERS, EMPTY_TXS, NOW_MS).balance,
  0
)

check(
  'balance: "500000000000000000" (0.5) -> 0.5',
  toWalletSnapshot('0xABCD', { ...BASE_INFO, coin_balance: '500000000000000000' }, BASE_COUNTERS, EMPTY_TXS, NOW_MS).balance,
  0.5
)

// ---------------------------------------------------------------------------
// 2. isContract and name pass-through
// ---------------------------------------------------------------------------
console.log('\n── isContract / name ────────────────────────────────────────')

check(
  'isContract: true passes through',
  toWalletSnapshot('0xABCD', { ...BASE_INFO, is_contract: true }, BASE_COUNTERS, EMPTY_TXS, NOW_MS).isContract,
  true
)

check(
  'isContract: false passes through',
  toWalletSnapshot('0xABCD', { ...BASE_INFO, is_contract: false }, BASE_COUNTERS, EMPTY_TXS, NOW_MS).isContract,
  false
)

check(
  'name: "Circle" passes through',
  toWalletSnapshot('0xABCD', { ...BASE_INFO, name: 'Circle' }, BASE_COUNTERS, EMPTY_TXS, NOW_MS).name,
  'Circle'
)

check(
  'name: null stays null',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, EMPTY_TXS, NOW_MS).name,
  null
)

// ---------------------------------------------------------------------------
// 3. txCount / transferCount are Number() of counter strings
// ---------------------------------------------------------------------------
console.log('\n── txCount / transferCount ──────────────────────────────────')

check(
  'txCount: "42" -> 42',
  toWalletSnapshot('0x1234', BASE_INFO, { transactions_count: '42', token_transfers_count: '0' }, EMPTY_TXS, NOW_MS).txCount,
  42
)

check(
  'transferCount: "999" -> 999',
  toWalletSnapshot('0x1234', BASE_INFO, { transactions_count: '0', token_transfers_count: '999' }, EMPTY_TXS, NOW_MS).transferCount,
  999
)

check(
  'txCount: "0" -> 0',
  toWalletSnapshot('0x1234', BASE_INFO, { transactions_count: '0', token_transfers_count: '0' }, EMPTY_TXS, NOW_MS).txCount,
  0
)

check(
  'txCount: "1000000" -> 1000000',
  toWalletSnapshot('0x1234', BASE_INFO, { transactions_count: '1000000', token_transfers_count: '0' }, EMPTY_TXS, NOW_MS).txCount,
  1000000
)

// ---------------------------------------------------------------------------
// 4. lastActive = items[0].timestamp (first item, not the max)
// ---------------------------------------------------------------------------
console.log('\n── lastActive ───────────────────────────────────────────────')

check(
  'lastActive: empty items -> null',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, EMPTY_TXS, NOW_MS).lastActive,
  null
)

check(
  'lastActive: single item -> that timestamp',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [{ timestamp: ONE_HOUR_AGO }] }, NOW_MS).lastActive,
  ONE_HOUR_AGO
)

// items[0] is the FIRST element, not the lexicographic max — use an older-first list
const OLDER_FIRST: string = ONE_DAY_AGO_PLUS_1H
const NEWER_SECOND: string = ONE_HOUR_AGO
check(
  'lastActive: items[0] even if items[1] is newer',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, {
    items: [{ timestamp: OLDER_FIRST }, { timestamp: NEWER_SECOND }],
  }, NOW_MS).lastActive,
  OLDER_FIRST
)

check(
  'lastActive: future timestamp in items[0] passes through',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [{ timestamp: FUTURE }] }, NOW_MS).lastActive,
  FUTURE
)

// ---------------------------------------------------------------------------
// 5. txns24h: counts items with timestamp >= since (nowMs - 24h)
// ---------------------------------------------------------------------------
console.log('\n── txns24h ──────────────────────────────────────────────────')

check(
  'txns24h: empty -> 0',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, EMPTY_TXS, NOW_MS).txns24h,
  0
)

check(
  'txns24h: exactly at boundary (== since) counts',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [{ timestamp: EXACTLY_SINCE }] }, NOW_MS).txns24h,
  1
)

check(
  'txns24h: 1 ms before boundary does NOT count',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [{ timestamp: ONE_MS_BEFORE_SINCE }] }, NOW_MS).txns24h,
  0
)

check(
  'txns24h: item 1 h ago counts',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [{ timestamp: ONE_HOUR_AGO }] }, NOW_MS).txns24h,
  1
)

check(
  'txns24h: item 25 h ago does not count',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [{ timestamp: ONE_DAY_AGO_PLUS_1H }] }, NOW_MS).txns24h,
  0
)

check(
  'txns24h: future timestamp counts',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [{ timestamp: FUTURE }] }, NOW_MS).txns24h,
  1
)

check(
  'txns24h: mixed — 3 inside, 2 outside',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, {
    items: [
      { timestamp: ONE_HOUR_AGO },
      { timestamp: EXACTLY_SINCE },
      { timestamp: FUTURE },
      { timestamp: ONE_MS_BEFORE_SINCE },
      { timestamp: ONE_DAY_AGO_PLUS_1H },
    ],
  }, NOW_MS).txns24h,
  3
)

// ---------------------------------------------------------------------------
// 6. txns24hCapped: items.length >= 50 AND ALL items are inside 24h
// ---------------------------------------------------------------------------
console.log('\n── txns24hCapped ────────────────────────────────────────────')

// Helper to build a page of N items all inside the 24h window
const recentItems = (n: number): { timestamp: string }[] =>
  Array.from({ length: n }, (_, i) => ({ timestamp: msToIso(NOW_MS - i * 60_000) }))

check(
  'txns24hCapped: 0 items -> false',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: [] }, NOW_MS).txns24hCapped,
  false
)

check(
  'txns24hCapped: 49 recent items -> false (< 50)',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: recentItems(49) }, NOW_MS).txns24hCapped,
  false
)

check(
  'txns24hCapped: 50 recent items -> true',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: recentItems(50) }, NOW_MS).txns24hCapped,
  true
)

check(
  'txns24hCapped: 60 recent items -> true',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: recentItems(60) }, NOW_MS).txns24hCapped,
  true
)

// 50 items but ONE is outside the window -> recent.length (49) != items.length (50) -> false
const fiftyWithOneOld: { timestamp: string }[] = [
  ...recentItems(49),
  { timestamp: ONE_DAY_AGO_PLUS_1H },
]
check(
  'txns24hCapped: 50 items, one outside 24h -> false',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: fiftyWithOneOld }, NOW_MS).txns24hCapped,
  false
)

// 49 recent + all inside, but total is only 49 -> false
check(
  'txns24hCapped: 49 recent, all inside, total < 50 -> false',
  toWalletSnapshot('0xABCD', BASE_INFO, BASE_COUNTERS, { items: recentItems(49) }, NOW_MS).txns24hCapped,
  false
)

// ---------------------------------------------------------------------------
// 7. address passes through unchanged (mixed case kept)
// ---------------------------------------------------------------------------
console.log('\n── address pass-through ─────────────────────────────────────')

const MIXED_CASE_ADDR = '0xAbCdEf1234567890abcdef1234567890AbCdEf12'
check(
  'address: mixed case preserved',
  toWalletSnapshot(MIXED_CASE_ADDR, BASE_INFO, BASE_COUNTERS, EMPTY_TXS, NOW_MS).address,
  MIXED_CASE_ADDR
)

check(
  'address: lowercase preserved',
  toWalletSnapshot('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', BASE_INFO, BASE_COUNTERS, EMPTY_TXS, NOW_MS).address,
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
)

// ---------------------------------------------------------------------------
// 8. Full snapshot shape (smoke test)
// ---------------------------------------------------------------------------
console.log('\n── full snapshot smoke test ─────────────────────────────────')

const fullTxs: RawTxPage = {
  items: [
    { timestamp: ONE_HOUR_AGO },          // inside 24h
    { timestamp: EXACTLY_SINCE },          // inside 24h (boundary)
    { timestamp: ONE_DAY_AGO_PLUS_1H },   // outside 24h
  ],
}
const fullSnap = toWalletSnapshot(
  '0xDeAdBeEf0000000000000000000000000000dEaD',
  { coin_balance: '2000000000000000000', is_contract: true, name: 'Vault' },
  { transactions_count: '77', token_transfers_count: '33' },
  fullTxs,
  NOW_MS
)

check('full snap — address',        fullSnap.address,       '0xDeAdBeEf0000000000000000000000000000dEaD')
check('full snap — balance',        fullSnap.balance,       2)
check('full snap — isContract',     fullSnap.isContract,    true)
check('full snap — name',           fullSnap.name,          'Vault')
check('full snap — txCount',        fullSnap.txCount,       77)
check('full snap — transferCount',  fullSnap.transferCount, 33)
check('full snap — lastActive',     fullSnap.lastActive,    ONE_HOUR_AGO)
check('full snap — txns24h',        fullSnap.txns24h,       2)
check('full snap — txns24hCapped',  fullSnap.txns24hCapped, false)

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(60)}`)
console.log(`Results: ${passed} / ${total} passed`)
if (passed < total) {
  console.error(`${total - passed} test(s) FAILED`)
  process.exit(1)
} else {
  console.log('All tests passed.')
}
