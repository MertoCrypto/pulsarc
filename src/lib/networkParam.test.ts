/**
 * Unit tests for src/lib/networkParam.ts — resolveNetKey.
 *
 * Run from the repo root:
 *   node --experimental-strip-types --no-warnings src/lib/networkParam.test.ts
 *
 * Uses only node:assert (strict mode). No framework, no build step.
 *
 * Combinations tested (param × buildNetworkId):
 *   param: null | 'mainnet' | 'testnet' | 'x' (unknown)
 *   build: 5042 (mainnet) | 5042002 (testnet) | 99999 (unknown build id)
 *
 * Rules under test:
 *   param === 'mainnet'  →  always 'mainnet'  (explicit override, build irrelevant)
 *   param === 'testnet'  →  always 'testnet'  (explicit override, build irrelevant)
 *   anything else/null   →  build 5042 → 'mainnet'; otherwise → 'testnet'
 */

import assert from 'node:assert/strict'
import { resolveNetKey, paramsFor } from './networkParam.ts'

// ── param === null ─────────────────────────────────────────────────────────────

assert.strictEqual(
  resolveNetKey(null, 5042),
  'mainnet',
  'null param + build 5042 -> mainnet',
)

assert.strictEqual(
  resolveNetKey(null, 5042002),
  'testnet',
  'null param + build 5042002 -> testnet',
)

assert.strictEqual(
  resolveNetKey(null, 99999),
  'testnet',
  'null param + unknown build id -> testnet',
)

// ── param === 'mainnet' (explicit override — build id is irrelevant) ───────────

assert.strictEqual(
  resolveNetKey('mainnet', 5042),
  'mainnet',
  '"mainnet" param + build 5042 -> mainnet',
)

assert.strictEqual(
  resolveNetKey('mainnet', 5042002),
  'mainnet',
  '"mainnet" param + build 5042002 -> mainnet (override beats build)',
)

// ── param === 'testnet' (explicit override — build id is irrelevant) ───────────

assert.strictEqual(
  resolveNetKey('testnet', 5042),
  'testnet',
  '"testnet" param + build 5042 -> testnet (override beats build)',
)

assert.strictEqual(
  resolveNetKey('testnet', 5042002),
  'testnet',
  '"testnet" param + build 5042002 -> testnet',
)

// ── param === 'x' (unknown/garbage — falls back to build) ────────────────────

assert.strictEqual(
  resolveNetKey('x', 5042),
  'mainnet',
  'unknown param "x" + build 5042 -> mainnet (falls back to build)',
)

assert.strictEqual(
  resolveNetKey('x', 5042002),
  'testnet',
  'unknown param "x" + build 5042002 -> testnet (falls back to build)',
)

// ── unknown build id (not 5042) → testnet ────────────────────────────────────

assert.strictEqual(
  resolveNetKey('x', 99999),
  'testnet',
  'unknown param + unknown build id -> testnet (not 5042 -> testnet)',
)

// ─────────────────────────────────────────────────────────────────────────────

// ── paramsFor: picking the build default writes no param, the other network writes an override ──
assert.deepStrictEqual(paramsFor('testnet', 5042002), {})
assert.deepStrictEqual(paramsFor('mainnet', 5042002), { net: 'mainnet' })
assert.deepStrictEqual(paramsFor('mainnet', 5042), {})
assert.deepStrictEqual(paramsFor('testnet', 5042), { net: 'testnet' })
// Round trip: whatever paramsFor writes must resolve back to the key the user picked
for (const build of [5042, 5042002]) {
  for (const key of ['testnet', 'mainnet'] as const) {
    const p = paramsFor(key, build)
    assert.strictEqual(resolveNetKey(p.net ?? null, build), key, `round trip ${key}@${build}`)
  }
}

const ASSERTION_COUNT = 10
console.log(`\nAll tests passed. (${ASSERTION_COUNT} assertions for resolveNetKey)`)
