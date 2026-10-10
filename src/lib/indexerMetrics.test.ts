/**
 * Tests for isIndexerUsable and buildIndexerMetrics.
 * Run: node --experimental-strip-types src/lib/indexerMetrics.test.ts
 *
 * Imports only from src/lib/indexerMetrics.ts and src/lib/appsLatest.ts —
 * no React, no react-query, no network.
 */

// Node resolves bare @/ imports via tsconfig paths only when using a bundler.
// For plain-node execution we inline the helpers we need rather than re-importing
// through the alias. We test the exported module directly via a file:// path.

import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { AppsLatest } from './appsLatest.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// We load the modules via explicit relative paths so Node can resolve them
// without the @/ tsconfig alias.
const { isIndexerUsable, buildIndexerMetrics } =
  await import(path.join(__dirname, 'indexerMetrics.ts'))
const { parseAppsLatest } =
  await import(path.join(__dirname, 'appsLatest.ts'))

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = Date.now()
const FRESH_TS = new Date(NOW - 30 * 60_000).toISOString()   // 30 min ago — fresh
const STALE_TS = new Date(NOW - 4 * 3600_000).toISOString()  // 4 h ago — stale

/** All windows identical → catching up, windowsDiffer = false */
const CATCHING_UP_SNAP = parseAppsLatest({
  network: 'testnet',
  generatedAt: FRESH_TS,
  apps: {
    usdc: {
      '1h':  { txs: 100, walletHours: 50, volume: 1000, fees: 0 },
      '24h': { txs: 100, walletHours: 50, volume: 1000, fees: 0 },
      '7d':  { txs: 100, walletHours: 50, volume: 1000, fees: 0 },
    },
  },
})

/** Different windows → caught up, windowsDiffer = true */
const CAUGHT_UP_SNAP = parseAppsLatest({
  network: 'testnet',
  generatedAt: FRESH_TS,
  apps: {
    usdc: {
      '1h':  { txs: 100,  walletHours: 50,  volume: 1000, fees: 0 },
      '24h': { txs: 2400, walletHours: 900, volume: 24000, fees: 0 },
      '7d':  { txs: 16800, walletHours: 5000, volume: 168000, fees: 0 },
    },
  },
})

const STALE_SNAP = parseAppsLatest({
  network: 'testnet',
  generatedAt: STALE_TS,
  apps: {
    usdc: {
      '1h':  { txs: 100, walletHours: 50, volume: 1000, fees: 0 },
      '24h': { txs: 2400, walletHours: 900, volume: 24000, fees: 0 },
      '7d':  { txs: 16800, walletHours: 5000, volume: 168000, fees: 0 },
    },
  },
})

// ── helpers ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✔ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✘ ${name}`)
    console.error(`    ${(err as Error).message}`)
    failed++
  }
}

// ── isIndexerUsable ───────────────────────────────────────────────────────────

console.log('\nisIndexerUsable')

test('null snapshot → false', () => {
  assert.equal(isIndexerUsable(null, '24h', NOW), false)
})

test('undefined snapshot → false', () => {
  assert.equal(isIndexerUsable(undefined, '1h', NOW), false)
})

test('range "30d" → false even with caught-up snap', () => {
  assert.equal(isIndexerUsable(CAUGHT_UP_SNAP, '30d', NOW), false)
})

test('range "all" → false even with caught-up snap', () => {
  assert.equal(isIndexerUsable(CAUGHT_UP_SNAP, 'all', NOW), false)
})

test('stale snapshot → false', () => {
  assert.equal(isIndexerUsable(STALE_SNAP, '24h', NOW), false)
})

test('fresh but windows identical (catching up) → false', () => {
  assert.equal(isIndexerUsable(CATCHING_UP_SNAP, '24h', NOW), false)
})

test('caught-up snap + range "1h" → true', () => {
  assert.equal(isIndexerUsable(CAUGHT_UP_SNAP, '1h', NOW), true)
})

test('caught-up snap + range "24h" → true', () => {
  assert.equal(isIndexerUsable(CAUGHT_UP_SNAP, '24h', NOW), true)
})

test('caught-up snap + range "7d" → true', () => {
  assert.equal(isIndexerUsable(CAUGHT_UP_SNAP, '7d', NOW), true)
})

// ── buildIndexerMetrics ───────────────────────────────────────────────────────

console.log('\nbuildIndexerMetrics')

const WIN_WITH_DATA = { txs: 200, walletHours: 80, volume: 5000.5, fees: 3.14 }
const WIN_ZERO_VOL  = { txs: 50,  walletHours: 10, volume: 0,      fees: 0 }

test('maps txs → txCount', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.txCount, 200)
})

test('maps walletHours → activeWallets', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.activeWallets, 80)
})

test('maps non-zero volume', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.volume, 5000.5)
})

test('maps non-zero fees → usdcFees', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.usdcFees, 3.14)
})

test('zero volume → null', () => {
  const m = buildIndexerMetrics(WIN_ZERO_VOL)
  assert.equal(m.volume, null)
})

test('zero fees → null', () => {
  const m = buildIndexerMetrics(WIN_ZERO_VOL)
  assert.equal(m.usdcFees, null)
})

test('tvl is always null', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.tvl, null)
})

test('rankChange is 0 (hook fills it)', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.rankChange, 0)
})

test('trend is null', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.trend, null)
})

test('estimated is false', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.estimated, false)
})

test('usersKnown is true', () => {
  const m = buildIndexerMetrics(WIN_WITH_DATA)
  assert.equal(m.usersKnown, true)
})

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)

// ── coverageHours (newer snapshots) ──
const withCov = (cov: number) => ({ ...CAUGHT_UP_SNAP!, coverageHours: cov }) as AppsLatest
test('coverage 25h: 1h and 24h usable, 7d not', () => {
  assert.equal(isIndexerUsable(withCov(25), '1h', NOW), true)
  assert.equal(isIndexerUsable(withCov(25), '24h', NOW), true)
  assert.equal(isIndexerUsable(withCov(25), '7d', NOW), false)
})
test('coverage 1h: nothing usable', () => {
  assert.equal(isIndexerUsable(withCov(1), '1h', NOW), false)
})
test('coverage wins over identical windows (same numbers but 168h held)', () => {
  assert.equal(isIndexerUsable({ ...CATCHING_UP_SNAP!, coverageHours: 168 } as AppsLatest, '7d', NOW), true)
})
