/**
 * Unit tests for src/lib/trackedWallets.ts
 * Run: node --experimental-strip-types --no-warnings src/lib/trackedWallets.test.ts
 */
import assert from 'node:assert/strict'
import {
  MAX_WALLETS,
  isWalletAddress,
  parseTracked,
  addTracked,
  removeTracked,
  type TrackedWallet,
} from './trackedWallets.ts'

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0
let total = 0

function test(name: string, fn: () => void) {
  total++
  try {
    fn()
    console.log(`  ✓  ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗  ${name}`)
    console.error(`     ${(err as Error).message}`)
  }
}

function makeWallet(address = '0xaAbBcCdDeEfF00112233445566778899aAbBcCdD', label = 'test', addedAt = 1000): TrackedWallet {
  return { address, label, addedAt }
}

// ─── isWalletAddress ─────────────────────────────────────────────────────────

console.log('\nisWalletAddress')

test('valid all-lowercase hex', () => {
  assert.equal(isWalletAddress('0xabcdef1234567890abcdef1234567890abcdef12'), true)
})

test('valid all-uppercase hex', () => {
  assert.equal(isWalletAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12'), true)
})

test('valid mixed-case (EIP-55 style)', () => {
  assert.equal(isWalletAddress('0xaAbBcCdDeEfF00112233445566778899aAbBcCdD'), true)
})

test('missing 0x prefix', () => {
  assert.equal(isWalletAddress('abcdef1234567890abcdef1234567890abcdef12'), false)
})

test('39 hex chars after 0x (one short)', () => {
  assert.equal(isWalletAddress('0xabcdef1234567890abcdef1234567890abcdef1'), false)
})

test('41 hex chars after 0x (one over)', () => {
  assert.equal(isWalletAddress('0xabcdef1234567890abcdef1234567890abcdef123'), false)
})

test('non-hex character in body (g)', () => {
  assert.equal(isWalletAddress('0xabcdef1234567890abcdef1234567890abcdefgg'), false)
})

test('leading whitespace', () => {
  assert.equal(isWalletAddress(' 0xabcdef1234567890abcdef1234567890abcdef12'), false)
})

test('trailing whitespace', () => {
  assert.equal(isWalletAddress('0xabcdef1234567890abcdef1234567890abcdef12 '), false)
})

test('empty string', () => {
  assert.equal(isWalletAddress(''), false)
})

// ─── parseTracked ─────────────────────────────────────────────────────────────

console.log('\nparseTracked')

test('null returns empty array', () => {
  assert.deepEqual(parseTracked(null), [])
})

test('empty string returns empty array', () => {
  assert.deepEqual(parseTracked(''), [])
})

test('invalid JSON returns empty array', () => {
  assert.deepEqual(parseTracked('{not valid json'), [])
})

test('JSON object (not array) returns empty array', () => {
  assert.deepEqual(parseTracked(JSON.stringify({ address: '0xabcdef1234567890abcdef1234567890abcdef12' })), [])
})

const VALID_ADDR_1 = '0xabcdef1234567890abcdef1234567890abcdef12'
const VALID_ADDR_2 = '0x1111111111111111111111111111111111111111'

test('valid entry is kept', () => {
  const entry: TrackedWallet = { address: VALID_ADDR_1, label: 'Alice', addedAt: 1000 }
  const result = parseTracked(JSON.stringify([entry]))
  assert.equal(result.length, 1)
  assert.equal(result[0].address, VALID_ADDR_1)
  assert.equal(result[0].label, 'Alice')
  assert.equal(result[0].addedAt, 1000)
})

test('entry with invalid address is dropped', () => {
  const bad = { address: 'not-an-address', label: 'Bad', addedAt: 1000 }
  assert.deepEqual(parseTracked(JSON.stringify([bad])), [])
})

test('null entry in array is dropped (does not throw)', () => {
  const entry: TrackedWallet = { address: VALID_ADDR_1, label: 'Alice', addedAt: 1000 }
  const result = parseTracked(JSON.stringify([null, entry]))
  assert.equal(result.length, 1)
  assert.equal(result[0].address, VALID_ADDR_1)
})

test('entry missing address field is dropped', () => {
  const noAddr = { label: 'NoAddr', addedAt: 1000 }
  assert.deepEqual(parseTracked(JSON.stringify([noAddr])), [])
})

test('entry with numeric address is dropped', () => {
  const numAddr = { address: 12345, label: 'Num', addedAt: 1000 }
  assert.deepEqual(parseTracked(JSON.stringify([numAddr])), [])
})

test('mixed array: valid kept, invalid dropped, order preserved', () => {
  const e1: TrackedWallet = { address: VALID_ADDR_1, label: 'First', addedAt: 1000 }
  const bad = { address: 'bad', label: 'Bad', addedAt: 2000 }
  const e2: TrackedWallet = { address: VALID_ADDR_2, label: 'Second', addedAt: 3000 }
  const result = parseTracked(JSON.stringify([e1, bad, e2]))
  assert.equal(result.length, 2)
  assert.equal(result[0].address, VALID_ADDR_1)
  assert.equal(result[1].address, VALID_ADDR_2)
})

// ─── addTracked ───────────────────────────────────────────────────────────────

console.log('\naddTracked')

test('invalid address returns result "invalid"', () => {
  const prev: TrackedWallet[] = []
  const { result, next } = addTracked(prev, 'not-an-address', 'label', 1)
  assert.equal(result, 'invalid')
})

test('invalid address returns the SAME array reference', () => {
  const prev: TrackedWallet[] = []
  const { next } = addTracked(prev, 'not-an-address', 'label', 1)
  assert.equal(next, prev)
})

test('duplicate address (exact case) returns result "duplicate"', () => {
  const prev = [makeWallet(VALID_ADDR_1)]
  const { result } = addTracked(prev, VALID_ADDR_1, 'dup', 2)
  assert.equal(result, 'duplicate')
})

test('duplicate detected case-insensitively (uppercase hex digits, lowercase 0x prefix)', () => {
  // toUpperCase() on the full string produces '0XABCDEF...' which fails isWalletAddress
  // (the regex requires the literal characters '0' and 'x'). We must uppercase only the hex part.
  const uppercaseHex = '0x' + VALID_ADDR_1.slice(2).toUpperCase()
  const prev = [makeWallet(VALID_ADDR_1)]
  const { result } = addTracked(prev, uppercaseHex, 'dup', 2)
  assert.equal(result, 'duplicate')
})

test('duplicate detected case-insensitively (lowercase input against mixed-case stored)', () => {
  const stored = '0xAAbBcCdDeEfF00112233445566778899aAbBcCdD'
  const prev = [makeWallet(stored)]
  const { result } = addTracked(prev, stored.toLowerCase(), 'dup', 2)
  assert.equal(result, 'duplicate')
})

test('duplicate returns the SAME array reference', () => {
  const prev = [makeWallet(VALID_ADDR_1)]
  const { next } = addTracked(prev, VALID_ADDR_1, 'dup', 2)
  assert.equal(next, prev)
})

test('list at MAX_WALLETS returns result "full"', () => {
  const prev: TrackedWallet[] = Array.from({ length: MAX_WALLETS }, (_, i) => {
    const hex = i.toString(16).padStart(40, '0')
    return makeWallet(`0x${hex}`)
  })
  const freshAddr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const { result } = addTracked(prev, freshAddr, 'new', 999)
  assert.equal(result, 'full')
})

test('list at MAX_WALLETS returns the SAME array reference', () => {
  const prev: TrackedWallet[] = Array.from({ length: MAX_WALLETS }, (_, i) => {
    const hex = i.toString(16).padStart(40, '0')
    return makeWallet(`0x${hex}`)
  })
  const freshAddr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const { next } = addTracked(prev, freshAddr, 'new', 999)
  assert.equal(next, prev)
})

test('24-entry list: 25th add succeeds (boundary)', () => {
  const prev: TrackedWallet[] = Array.from({ length: MAX_WALLETS - 1 }, (_, i) => {
    const hex = i.toString(16).padStart(40, '0')
    return makeWallet(`0x${hex}`)
  })
  const newAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const { result, next } = addTracked(prev, newAddr, 'boundary', 42)
  assert.equal(result, 'ok')
  assert.equal(next.length, MAX_WALLETS)
})

test('25-entry list: 26th add is "full" (boundary)', () => {
  const prev: TrackedWallet[] = Array.from({ length: MAX_WALLETS }, (_, i) => {
    const hex = i.toString(16).padStart(40, '0')
    return makeWallet(`0x${hex}`)
  })
  const another = '0xcccccccccccccccccccccccccccccccccccccccc'
  const { result } = addTracked(prev, another, 'overflow', 99)
  assert.equal(result, 'full')
})

test('success: new wallet placed FIRST in result', () => {
  const existing = makeWallet(VALID_ADDR_2, 'old', 1)
  const newAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const { next } = addTracked([existing], newAddr, 'new', 5)
  assert.equal(next[0].address, newAddr)
  assert.equal(next[1].address, VALID_ADDR_2)
})

test('success: label is trimmed', () => {
  const newAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const { next } = addTracked([], newAddr, '  My Wallet  ', 5)
  assert.equal(next[0].label, 'My Wallet')
})

test('success: addedAt is set to the passed now value', () => {
  const newAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const { next } = addTracked([], newAddr, 'label', 12345)
  assert.equal(next[0].addedAt, 12345)
})

test('success: input array is not mutated', () => {
  const prev: TrackedWallet[] = [makeWallet(VALID_ADDR_2)]
  const snapshot = [...prev]
  const newAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  addTracked(prev, newAddr, 'label', 1)
  assert.equal(prev.length, snapshot.length)
  assert.equal(prev[0].address, snapshot[0].address)
})

test('success: returned array is a new reference', () => {
  const prev: TrackedWallet[] = [makeWallet(VALID_ADDR_2)]
  const newAddr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const { next } = addTracked(prev, newAddr, 'label', 1)
  assert.notEqual(next, prev)
})

// ordering: invalid < duplicate < full
test('ordering: invalid address checked before duplicate check', () => {
  // if duplicate were checked first this would need a valid address in the list
  // but since 'not-valid' fails isWalletAddress before we ever scan prev, result is 'invalid'
  const prev = [makeWallet('not-valid')]           // prev itself is sketchy but addTracked doesn't validate existing entries
  const { result } = addTracked(prev, 'not-valid', 'x', 1)
  assert.equal(result, 'invalid')
})

test('ordering: duplicate checked before full', () => {
  // list is full AND address is a duplicate — expect 'duplicate' (checked before 'full')
  const prev: TrackedWallet[] = Array.from({ length: MAX_WALLETS }, (_, i) => {
    const hex = i.toString(16).padStart(40, '0')
    return makeWallet(`0x${hex}`)
  })
  const existingAddr = prev[0].address    // already in the full list
  const { result } = addTracked(prev, existingAddr, 'dup', 1)
  assert.equal(result, 'duplicate')
})

// ─── removeTracked ────────────────────────────────────────────────────────────

console.log('\nremoveTracked')

test('removes the matching address', () => {
  const prev = [makeWallet(VALID_ADDR_1), makeWallet(VALID_ADDR_2)]
  const result = removeTracked(prev, VALID_ADDR_1)
  assert.equal(result.length, 1)
  assert.equal(result[0].address, VALID_ADDR_2)
})

test('removal is case-insensitive (lowercase input vs stored mixed-case)', () => {
  const mixed = '0xAAbBcCdDeEfF00112233445566778899aAbBcCdD'
  const prev = [makeWallet(mixed)]
  const result = removeTracked(prev, mixed.toLowerCase())
  assert.deepEqual(result, [])
})

test('removal is case-insensitive (uppercase input vs stored lowercase)', () => {
  const lower = '0xabcdef1234567890abcdef1234567890abcdef12'
  const prev = [makeWallet(lower)]
  const result = removeTracked(prev, lower.toUpperCase())
  assert.deepEqual(result, [])
})

test('unknown address keeps all entries', () => {
  const prev = [makeWallet(VALID_ADDR_1), makeWallet(VALID_ADDR_2)]
  const unknown = '0xdddddddddddddddddddddddddddddddddddddddd'
  const result = removeTracked(prev, unknown)
  assert.equal(result.length, 2)
})

test('input array is not mutated', () => {
  const prev = [makeWallet(VALID_ADDR_1), makeWallet(VALID_ADDR_2)]
  removeTracked(prev, VALID_ADDR_1)
  assert.equal(prev.length, 2)
})

test('result is a new array reference', () => {
  const prev = [makeWallet(VALID_ADDR_1)]
  const result = removeTracked(prev, VALID_ADDR_2)  // no-op removal still returns new ref
  assert.notEqual(result, prev)
})

test('MAX_WALLETS is 25 (the documented watch-list size)', () => {
  assert.equal(MAX_WALLETS, 25)
})

test('parseTracked drops an entry whose address is an array holding a valid address string', () => {
  const raw = JSON.stringify([{ address: [VALID_ADDR_1], label: 'x', addedAt: 1 }, { address: VALID_ADDR_2, label: 'y', addedAt: 2 }])
  const out = parseTracked(raw)
  assert.equal(out.length, 1)
  assert.equal(out[0].address, VALID_ADDR_2)
})

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed}/${total} assertions passed`)
if (passed < total) process.exit(1)
