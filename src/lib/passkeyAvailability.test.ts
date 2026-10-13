/**
 * passkeyAvailability.test.ts
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/passkeyAvailability.test.ts
 *
 * Uses node:assert/strict only — no test runner dependency.
 */

import assert from 'node:assert/strict'
import { passkeyAvailable } from './passkeyAvailability.ts'

// Arc Testnet (5042002) — the only supported network
assert.equal(passkeyAvailable(5042002), true,  'Arc Testnet (5042002) must return true')

// Arc Mainnet (5042) — not yet supported
assert.equal(passkeyAvailable(5042),    false, 'Arc Mainnet (5042) must return false')

// Ethereum Mainnet
assert.equal(passkeyAvailable(1),       false, 'Ethereum Mainnet (1) must return false')

// Zero / unknown
assert.equal(passkeyAvailable(0),       false, 'ID 0 must return false')

// NaN — Number(NaN) === NaN, and NaN !== 5042002
assert.equal(passkeyAvailable(NaN),     false, 'NaN must return false')

console.log('passkeyAvailability: all checks passed.')
