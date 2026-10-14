/**
 * Tests for src/lib/rpcTransport.ts
 *
 * Run from repo root:
 *   node --experimental-strip-types src/lib/rpcTransport.test.ts
 *
 * Uses the real module — no copied bodies.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rpcUrls } from './rpcTransport.ts'

const MAINNET_DIRECT = [
  'https://rpc.mainnet.arc.io',
  'https://rpc.blockdaemon.mainnet.arc.io',
  'https://rpc.drpc.mainnet.arc.io',
]

const TESTNET_DIRECT = [
  'https://rpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.network',
  'https://rpc.drpc.testnet.arc.network',
]

const ORIGIN = 'https://pulsarc.vercel.app'
const ORIGIN_SLASH = 'https://pulsarc.vercel.app/'

// ---------------------------------------------------------------------------
// 1. Mainnet: proxy first, then direct URLs in order
// ---------------------------------------------------------------------------
void test('mainnet: proxy is first when origin is given', () => {
  const result = rpcUrls('mainnet', MAINNET_DIRECT, ORIGIN)
  assert.equal(result[0], 'https://pulsarc.vercel.app/rpc')
  assert.deepEqual(result.slice(1), MAINNET_DIRECT)
})

// ---------------------------------------------------------------------------
// 2. Testnet: proxy first with /rpc-testnet path
// ---------------------------------------------------------------------------
void test('testnet: proxy is first with /rpc-testnet path when origin is given', () => {
  const result = rpcUrls('testnet', TESTNET_DIRECT, ORIGIN)
  assert.equal(result[0], 'https://pulsarc.vercel.app/rpc-testnet')
  assert.deepEqual(result.slice(1), TESTNET_DIRECT)
})

// ---------------------------------------------------------------------------
// 3. No origin (Node / SSR) → no proxy URL
// ---------------------------------------------------------------------------
void test('mainnet: no proxy when origin is undefined', () => {
  const result = rpcUrls('mainnet', MAINNET_DIRECT, undefined)
  assert.deepEqual(result, MAINNET_DIRECT)
})

void test('testnet: no proxy when origin is undefined', () => {
  const result = rpcUrls('testnet', TESTNET_DIRECT, undefined)
  assert.deepEqual(result, TESTNET_DIRECT)
})

void test('mainnet: no proxy when origin is empty string', () => {
  const result = rpcUrls('mainnet', MAINNET_DIRECT, '')
  assert.deepEqual(result, MAINNET_DIRECT)
})

// ---------------------------------------------------------------------------
// 4. Trailing slash on origin is stripped (no double slashes)
// ---------------------------------------------------------------------------
void test('mainnet: trailing slash in origin is stripped', () => {
  const result = rpcUrls('mainnet', MAINNET_DIRECT, ORIGIN_SLASH)
  assert.equal(result[0], 'https://pulsarc.vercel.app/rpc')
  // Ensure there is no double slash
  assert.ok(!result[0].includes('//rpc'), `Unexpected double slash in: ${result[0]}`)
})

void test('testnet: trailing slash in origin is stripped', () => {
  const result = rpcUrls('testnet', TESTNET_DIRECT, ORIGIN_SLASH)
  assert.equal(result[0], 'https://pulsarc.vercel.app/rpc-testnet')
  assert.ok(!result[0].includes('//rpc'), `Unexpected double slash in: ${result[0]}`)
})

// ---------------------------------------------------------------------------
// 5. De-duplication: duplicate direct URLs are removed (first occurrence kept)
// ---------------------------------------------------------------------------
void test('de-duplicates direct URLs, preserving order', () => {
  const duped = [
    'https://rpc.mainnet.arc.io',
    'https://rpc.blockdaemon.mainnet.arc.io',
    'https://rpc.mainnet.arc.io',             // duplicate
    'https://rpc.drpc.mainnet.arc.io',
    'https://rpc.blockdaemon.mainnet.arc.io', // duplicate
  ]
  const result = rpcUrls('mainnet', duped, undefined)
  assert.deepEqual(result, [
    'https://rpc.mainnet.arc.io',
    'https://rpc.blockdaemon.mainnet.arc.io',
    'https://rpc.drpc.mainnet.arc.io',
  ])
})

void test('de-duplicates direct URLs even when proxy is prepended', () => {
  const duped = [
    'https://rpc.testnet.arc.io',
    'https://rpc.testnet.arc.io', // duplicate
  ]
  const result = rpcUrls('testnet', duped, ORIGIN)
  assert.deepEqual(result, [
    'https://pulsarc.vercel.app/rpc-testnet',
    'https://rpc.testnet.arc.io',
  ])
})

// ---------------------------------------------------------------------------
// 6. Unknown network → only direct URLs, no proxy
// ---------------------------------------------------------------------------
void test('unknown network: no proxy prepended', () => {
  const direct = ['https://rpc.someother.network']
  const result = rpcUrls('devnet', direct, ORIGIN)
  assert.deepEqual(result, direct)
})

void test('empty network string: no proxy prepended', () => {
  const direct = ['https://rpc.mainnet.arc.io']
  const result = rpcUrls('', direct, ORIGIN)
  assert.deepEqual(result, direct)
})

// ---------------------------------------------------------------------------
// 7. Both networks: verify proxy paths are distinct
// ---------------------------------------------------------------------------
void test('mainnet and testnet proxy paths are different', () => {
  const mainResult = rpcUrls('mainnet', [], ORIGIN)
  const testResult = rpcUrls('testnet', [], ORIGIN)
  assert.notEqual(mainResult[0], testResult[0])
  assert.equal(mainResult[0], 'https://pulsarc.vercel.app/rpc')
  assert.equal(testResult[0], 'https://pulsarc.vercel.app/rpc-testnet')
})

console.log('All rpcTransport tests passed.')
