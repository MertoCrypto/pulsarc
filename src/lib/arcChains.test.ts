/**
 * Unit tests for src/lib/arcChains.ts
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/arcChains.test.ts
 *
 * No test framework — uses node:assert/strict only.
 */

import assert from 'node:assert/strict'
import { arcTestnet, arcMainnet, selectArcChain } from './arcChains.ts'
import { NETWORKS } from './chain.ts'

// ---------------------------------------------------------------------------
// 1. Testnet chain object
// ---------------------------------------------------------------------------

assert.equal(arcTestnet.id, NETWORKS.testnet.id, 'arcTestnet.id matches NETWORKS.testnet.id')
assert.equal(arcTestnet.id, 5042002, 'arcTestnet.id is 5042002')
// arcTestnet is viem's built-in; its rpcUrl differs from NETWORKS.testnet.rpcUrl
// (viem ships 'https://rpc.testnet.arc.network', app config overrides with 'https://rpc.testnet.arc.io')
// — the transport override in config.ts is the correct place for that; we only verify the id here.
assert.ok(arcTestnet.rpcUrls.default.http[0].length > 0, 'arcTestnet has a default rpcUrl')
// viem's built-in explorer differs from NETWORKS.testnet.explorerUrl — that's expected
assert.ok(arcTestnet.blockExplorers?.default.url.length ?? 0 > 0, 'arcTestnet has an explorer url')

// ---------------------------------------------------------------------------
// 2. Mainnet chain object (defined via defineChain, driven by NETWORKS.mainnet)
// ---------------------------------------------------------------------------

assert.equal(arcMainnet.id, NETWORKS.mainnet.id, 'arcMainnet.id matches NETWORKS.mainnet.id')
assert.equal(arcMainnet.id, 5042, 'arcMainnet.id is 5042')
assert.equal(arcMainnet.rpcUrls.default.http[0], NETWORKS.mainnet.rpcUrl, 'arcMainnet rpcUrl matches')
assert.equal(arcMainnet.blockExplorers?.default.url, NETWORKS.mainnet.explorerUrl, 'arcMainnet explorerUrl matches')

// nativeCurrency shared with arcTestnet (same USDC-as-gas token)
assert.deepEqual(arcMainnet.nativeCurrency, arcTestnet.nativeCurrency, 'arcMainnet nativeCurrency equals arcTestnet nativeCurrency')
assert.equal(arcMainnet.nativeCurrency.symbol, 'USDC', 'nativeCurrency.symbol is USDC')
assert.equal(arcMainnet.nativeCurrency.decimals, 18, 'nativeCurrency.decimals is 18')

// ---------------------------------------------------------------------------
// 3. selectArcChain — testnet selector
// ---------------------------------------------------------------------------

const selectedTestnet = selectArcChain(NETWORKS.testnet.id)
assert.equal(selectedTestnet.id, NETWORKS.testnet.id, 'selectArcChain(testnet id) returns testnet chain')

// ---------------------------------------------------------------------------
// 4. selectArcChain — mainnet selector
// ---------------------------------------------------------------------------

const selectedMainnet = selectArcChain(NETWORKS.mainnet.id)
assert.equal(selectedMainnet.id, NETWORKS.mainnet.id, 'selectArcChain(mainnet id) returns mainnet chain')
assert.equal(selectedMainnet.rpcUrls.default.http[0], NETWORKS.mainnet.rpcUrl, 'selectArcChain mainnet rpc matches')

// ---------------------------------------------------------------------------
// 5. selectArcChain — unknown id throws
// ---------------------------------------------------------------------------

assert.throws(
  () => selectArcChain(9999999),
  /unknown Arc chain id 9999999/,
  'selectArcChain throws for unknown chain id',
)

// ---------------------------------------------------------------------------
// 6. Testnet and mainnet ids are distinct
// ---------------------------------------------------------------------------

assert.notEqual(NETWORKS.testnet.id, NETWORKS.mainnet.id, 'testnet and mainnet ids differ')

console.log('All tests passed.')
