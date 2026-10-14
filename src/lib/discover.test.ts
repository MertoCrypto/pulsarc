/**
 * Tests for src/lib/discover.ts
 * Run: node --experimental-strip-types src/lib/discover.test.ts
 */
import assert from 'node:assert/strict'
import { parseDiscover, buildDisplayList } from './discover.ts'
import type { ContractLabel, DiscoverSnapshot } from './discover.ts'

let pass = 0
let fail = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✔ ${name}`)
    pass++
  } catch (e) {
    console.log(`  ✘ ${name}`)
    console.log(`    ${e instanceof Error ? e.message : String(e)}`)
    fail++
  }
}

const ADDR1 = '0xaaaabbbbccccddddeeeeffff0000111122223333'
const ADDR2 = '0x1111222233334444555566667777888899990000'
const TRACKED = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

const makeSnap = (overrides?: Partial<DiscoverSnapshot>): DiscoverSnapshot => ({
  network: 'testnet',
  generatedAt: new Date().toISOString(),
  contracts: [
    { address: ADDR1, txs: 5000, walletHours: 50, fees: 10 },
    { address: ADDR2, txs: 2000, walletHours: 500, fees: 3 },
  ],
  ...overrides,
})

console.log('\nparseDiscover')

test('parses valid snapshot', () => {
  const s = parseDiscover({
    network: 'mainnet',
    generatedAt: '2026-10-11T12:00:00Z',
    contracts: [{ address: ADDR1, txs: 100, walletHours: 10, fees: 0.5 }],
  })
  assert.ok(s)
  assert.equal(s.network, 'mainnet')
  assert.equal(s.contracts.length, 1)
  assert.equal(s.contracts[0].address, ADDR1.toLowerCase())
})

test('returns null for null', () => {
  assert.equal(parseDiscover(null), null)
})

test('returns null when network is missing', () => {
  assert.equal(parseDiscover({ generatedAt: '2026-10-11T12:00:00Z', contracts: [] }), null)
})

test('returns null when contracts is not an array', () => {
  assert.equal(parseDiscover({ network: 'testnet', generatedAt: '2026-10-11T12:00:00Z', contracts: {} }), null)
})

test('drops malformed contract entries, keeps valid', () => {
  const s = parseDiscover({
    network: 'testnet',
    generatedAt: '2026-10-11T12:00:00Z',
    contracts: [
      { address: ADDR1, txs: 100, walletHours: 10, fees: 0.5 },
      { address: ADDR2, txs: 'bad', walletHours: 10, fees: 0.5 }, // dropped
    ],
  })
  assert.ok(s)
  assert.equal(s.contracts.length, 1)
})

console.log('\nbuildDisplayList')

test('excludes tracked contracts', () => {
  const snap = makeSnap({
    contracts: [
      { address: TRACKED, txs: 9999, walletHours: 100, fees: 20 },
      { address: ADDR1, txs: 5000, walletHours: 50, fees: 10 },
    ],
  })
  const tracked = new Set([TRACKED.toLowerCase()])
  const list = buildDisplayList(snap, {}, tracked, 100_000)
  assert.ok(list.every(c => c.address !== TRACKED.toLowerCase()))
  assert.equal(list.length, 1)
})

test('missing label → displayName null', () => {
  const list = buildDisplayList(makeSnap(), {}, new Set(), 100_000)
  assert.equal(list[0].displayName, null)
})

test('hostile label: control chars are stripped, HTML tags remain as plain text', () => {
  const labels: Record<string, ContractLabel> = {
    [ADDR1]: { contract: true, name: 'Safe\x01\x1fName', symbol: null },
  }
  const list = buildDisplayList(makeSnap(), labels, new Set(), 100_000)
  const name = list[0].displayName
  assert.ok(name !== null)
  // Control chars stripped
  assert.ok(!name.includes('\x01'))
  assert.ok(!name.includes('\x1f'))
  assert.equal(name, 'SafeName')
})

test('hostile label: direction-override and zero-width characters are removed', () => {
  const labels: Record<string, ContractLabel> = {
    [ADDR1]: { contract: true, name: '\u202ECDSU\u200B', symbol: null },
  }
  const list = buildDisplayList(makeSnap(), labels, new Set(), 100_000)
  assert.equal(list[0].displayName, 'CDSU')
})

test('name capped at 40 chars', () => {
  const labels: Record<string, ContractLabel> = {
    [ADDR1]: { contract: true, name: 'A'.repeat(60), symbol: null },
  }
  const list = buildDisplayList(makeSnap(), labels, new Set(), 100_000)
  assert.ok((list[0].displayName?.length ?? 0) <= 40)
})

test('zero walletHours with txs >= 1000 → automated-looking', () => {
  const snap = makeSnap({ contracts: [{ address: ADDR1, txs: 1000, walletHours: 0, fees: 1 }] })
  const list = buildDisplayList(snap, {}, new Set(), 100_000)
  assert.equal(list[0].automatedLooking, true)
})

test('threshold edge: txs/walletHours 49.9 → not automated', () => {
  // 999 txs / 20 walletHours = 49.95 BUT txs < 1000 so both conditions fail
  const snap = makeSnap({ contracts: [{ address: ADDR1, txs: 999, walletHours: 20, fees: 1 }] })
  const list = buildDisplayList(snap, {}, new Set(), 100_000)
  assert.equal(list[0].automatedLooking, false)
})

test('threshold edge: txs >= 1000 but ratio 49.9 → not automated', () => {
  // 1000 / 20.1 ≈ 49.75 < 50
  const snap = makeSnap({ contracts: [{ address: ADDR1, txs: 1000, walletHours: 21, fees: 1 }] })
  const list = buildDisplayList(snap, {}, new Set(), 100_000)
  // ratio = 1000/21 ≈ 47.6 < 50
  assert.equal(list[0].automatedLooking, false)
})

test('threshold edge: txs=1000 walletHours=20 (ratio=50 exactly) → automated', () => {
  const snap = makeSnap({ contracts: [{ address: ADDR1, txs: 1000, walletHours: 20, fees: 1 }] })
  const list = buildDisplayList(snap, {}, new Set(), 100_000)
  assert.equal(list[0].automatedLooking, true)
})

test('networkShare is null when networkTxs === 0', () => {
  const list = buildDisplayList(makeSnap(), {}, new Set(), 0)
  assert.equal(list[0].networkShare, null)
})

test('networkShare computed correctly', () => {
  const snap = makeSnap({ contracts: [{ address: ADDR1, txs: 100, walletHours: 10, fees: 1 }] })
  const list = buildDisplayList(snap, {}, new Set(), 1000)
  assert.equal(list[0].networkShare, 10)
})

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
