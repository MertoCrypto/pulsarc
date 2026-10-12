/**
 * Unit tests for src/lib/nfts.ts — toNftCollection and sortByHolders.
 *
 * Run from the repo root:
 *   node --experimental-strip-types --no-warnings src/lib/nfts.test.ts
 *
 * Uses only node:assert (strict mode). No framework, no build step.
 */

import assert from 'node:assert/strict'
import { toNftCollection, sortByHolders } from './nfts.ts'
import type { NftKind, NftCollection, RawNftToken } from './nfts.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function raw(overrides: Partial<RawNftToken> = {}): RawNftToken {
  return {
    address_hash: '0xDEFAULT',
    name: 'My Collection',
    symbol: 'MCO',
    holders_count: '42',
    total_supply: '1000',
    ...overrides,
  }
}

function col(overrides: Partial<NftCollection> = {}): NftCollection {
  return {
    address: '0xA',
    name: 'Test',
    symbol: 'T',
    kind: 'ERC-721',
    holders: 10,
    items: 100,
    transfers: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// toNftCollection — address
// ---------------------------------------------------------------------------

{
  const result = toNftCollection(raw({ address_hash: '0xABCDEF' }), 'ERC-721')
  assert.strictEqual(result.address, '0xABCDEF', 'address: taken from address_hash')
}

// ---------------------------------------------------------------------------
// toNftCollection — name
// ---------------------------------------------------------------------------

{
  const result = toNftCollection(raw({ name: 'Cool Apes' }), 'ERC-721')
  assert.strictEqual(result.name, 'Cool Apes', 'name: passes through when present')
}

{
  // null -> 'Unnamed collection'  (via ??)
  const result = toNftCollection(raw({ name: null }), 'ERC-721')
  assert.strictEqual(result.name, 'Unnamed collection', 'name: null -> "Unnamed collection"')
}

{
  // Empty-string name: ?? only replaces null/undefined, so '' stays ''
  const result = toNftCollection(raw({ name: '' }), 'ERC-721')
  assert.strictEqual(result.name, '', 'name: empty-string stays "" (pinned — ?? does not replace empty string)')
}

{
  // Same for the symbol: only null is replaced by the dash
  const result = toNftCollection(raw({ symbol: '' }), 'ERC-721')
  assert.strictEqual(result.symbol, '', 'symbol: empty-string stays "" (pinned)')
}

// ---------------------------------------------------------------------------
// toNftCollection — symbol
// ---------------------------------------------------------------------------

{
  const result = toNftCollection(raw({ symbol: 'APE' }), 'ERC-721')
  assert.strictEqual(result.symbol, 'APE', 'symbol: passes through when present')
}

{
  // null -> em-dash fallback
  const result = toNftCollection(raw({ symbol: null }), 'ERC-721')
  assert.strictEqual(result.symbol, '—', 'symbol: null -> "—"')
}

// ---------------------------------------------------------------------------
// toNftCollection — kind
// ---------------------------------------------------------------------------

{
  const r = toNftCollection(raw(), 'ERC-721')
  assert.strictEqual(r.kind, 'ERC-721', 'kind: ERC-721 passes through')
}

{
  const r = toNftCollection(raw(), 'ERC-1155')
  assert.strictEqual(r.kind, 'ERC-1155', 'kind: ERC-1155 passes through')
}

// ---------------------------------------------------------------------------
// toNftCollection — holders
// ---------------------------------------------------------------------------

{
  const r = toNftCollection(raw({ holders_count: '500' }), 'ERC-721')
  assert.strictEqual(r.holders, 500, 'holders: string "500" -> number 500')
}

{
  // null -> Number(null ?? 0) = Number(0) = 0
  const r = toNftCollection(raw({ holders_count: null }), 'ERC-721')
  assert.strictEqual(r.holders, 0, 'holders: null -> 0')
}

{
  // '0' -> Number('0') = 0
  const r = toNftCollection(raw({ holders_count: '0' }), 'ERC-721')
  assert.strictEqual(r.holders, 0, 'holders: "0" -> 0')
}

// ---------------------------------------------------------------------------
// toNftCollection — items (total_supply)
// ---------------------------------------------------------------------------

{
  // Normal supply string
  const r = toNftCollection(raw({ total_supply: '14800206' }), 'ERC-721')
  assert.strictEqual(r.items, 14800206, 'items: "14800206" -> 14800206')
}

{
  // null total_supply -> ternary is false path -> null
  const r = toNftCollection(raw({ total_supply: null }), 'ERC-721')
  assert.strictEqual(r.items, null, 'items: null total_supply -> null')
}

{
  // Empty-string total_supply: '' is falsy -> null
  const r = toNftCollection(raw({ total_supply: '' }), 'ERC-721')
  assert.strictEqual(r.items, null, 'items: empty-string total_supply -> null (empty string is falsy)')
}

{
  // '0': the string '0' is TRUTHY (non-empty), so Number('0') = 0  — pinned
  const r = toNftCollection(raw({ total_supply: '0' }), 'ERC-721')
  assert.strictEqual(r.items, 0, 'items: "0" total_supply -> 0 (pinned — non-empty string is truthy)')
}

{
  // Uint256-max supply: Number() produces a float beyond MAX_SAFE_INTEGER
  const huge = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
  const r = toNftCollection(raw({ total_supply: huge }), 'ERC-721')
  assert.ok(typeof r.items === 'number', 'items: huge supply -> typeof number')
  assert.ok((r.items as number) > 1e70, 'items: huge supply > 1e70')
}

// ---------------------------------------------------------------------------
// toNftCollection — transfers always null
// ---------------------------------------------------------------------------

{
  const r = toNftCollection(raw(), 'ERC-721')
  assert.strictEqual(r.transfers, null, 'transfers: always null')
}

// ---------------------------------------------------------------------------
// sortByHolders — basic descending order
// ---------------------------------------------------------------------------

{
  const a = col({ address: '0xA', holders: 5 })
  const b = col({ address: '0xB', holders: 100 })
  const c = col({ address: '0xC', holders: 20 })
  const sorted = sortByHolders([a, b, c])
  assert.deepStrictEqual(
    sorted.map(x => x.address),
    ['0xB', '0xC', '0xA'],
    'sortByHolders: descending by holders',
  )
}

// ---------------------------------------------------------------------------
// sortByHolders — stable on equal holders (input order preserved)
// ---------------------------------------------------------------------------

{
  const x = col({ address: '0x1', holders: 50 })
  const y = col({ address: '0x2', holders: 50 })
  const z = col({ address: '0x3', holders: 50 })
  const sorted = sortByHolders([x, y, z])
  assert.deepStrictEqual(
    sorted.map(c => c.address),
    ['0x1', '0x2', '0x3'],
    'sortByHolders: equal holders — input order preserved (stable)',
  )
}

// ---------------------------------------------------------------------------
// sortByHolders — returns a NEW array (does not mutate input)
// ---------------------------------------------------------------------------

{
  const a = col({ address: '0xA', holders: 1 })
  const b = col({ address: '0xB', holders: 99 })
  const input = [a, b]
  const sorted = sortByHolders(input)

  // Different array identity
  assert.notStrictEqual(sorted, input, 'sortByHolders: returns a new array')

  // Original order unchanged
  assert.strictEqual(input[0].address, '0xA', 'sortByHolders: input[0] not mutated')
  assert.strictEqual(input[1].address, '0xB', 'sortByHolders: input[1] not mutated')
}

// ---------------------------------------------------------------------------
// sortByHolders — empty array
// ---------------------------------------------------------------------------

{
  const sorted = sortByHolders([])
  assert.deepStrictEqual(sorted, [], 'sortByHolders: empty -> []')
}

// ---------------------------------------------------------------------------
// sortByHolders — single element
// ---------------------------------------------------------------------------

{
  const only = col({ address: '0xONLY', holders: 7 })
  const sorted = sortByHolders([only])
  assert.strictEqual(sorted.length, 1, 'sortByHolders: single -> length 1')
  assert.strictEqual(sorted[0].address, '0xONLY', 'sortByHolders: single -> same element')
}

// ---------------------------------------------------------------------------
// sortByHolders — mixed kinds (ERC-721 and ERC-1155)
// ---------------------------------------------------------------------------

{
  const e721 = col({ address: '0x721', kind: 'ERC-721', holders: 3 })
  const e1155 = col({ address: '0x1155', kind: 'ERC-1155', holders: 999 })
  const sorted = sortByHolders([e721, e1155])
  assert.strictEqual(sorted[0].address, '0x1155', 'sortByHolders: ERC-1155 with more holders sorts first')
  assert.strictEqual(sorted[1].address, '0x721', 'sortByHolders: ERC-721 with fewer holders sorts last')
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

const ASSERTION_COUNT = 35
console.log(`\nAll tests passed. (${ASSERTION_COUNT} assertions across toNftCollection + sortByHolders)`)
