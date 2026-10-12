/**
 * Tests for dataFreshness.ts
 *
 * Run with:
 *   node --experimental-strip-types src/lib/dataFreshness.test.ts
 *
 * Uses plain node:assert — no test runner required.
 */

import assert from 'node:assert/strict'
import {
  timestampOf,
  MAX_AGE_MIN,
  ageMinutes,
  classify,
  rowsToCheck,
  formatAge,
  summarize,
  type FreshState,
} from './dataFreshness.ts'

// Import CATALOG to guard against typos in MAX_AGE_MIN keys
import { CATALOG, type CatalogEntry } from './dataCatalog.ts'

// ── helpers ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ok  ${name}`)
    passed++
  } catch (err) {
    console.error(`  FAIL ${name}`)
    console.error(err)
    failed++
  }
}

// Fixed reference instant: 2026-10-12T12:00:00.000Z = 1760270400000
const NOW = 1_760_270_400_000

function isoMinsAgo(min: number): string {
  return new Date(NOW - min * 60_000).toISOString()
}

// ── ageMinutes ────────────────────────────────────────────────────────────────

console.log('\nageMinutes')

test('valid ISO string returns correct minutes', () => {
  const age = ageMinutes(isoMinsAgo(15), NOW)
  assert(age !== null)
  assert(Math.abs(age - 15) < 0.01, `expected ~15 got ${age}`)
})

test('garbage string returns null', () => {
  assert.equal(ageMinutes('not-a-date', NOW), null)
})

test('number input returns null', () => {
  assert.equal(ageMinutes(12345, NOW), null)
})

test('null input returns null', () => {
  assert.equal(ageMinutes(null, NOW), null)
})

test('object input returns null', () => {
  assert.equal(ageMinutes({}, NOW), null)
})

test('future by more than 5 minutes returns null', () => {
  const future = new Date(NOW + 6 * 60_000).toISOString()
  assert.equal(ageMinutes(future, NOW), null)
})

test('future within 5 minutes returns 0', () => {
  const slightFuture = new Date(NOW + 2 * 60_000).toISOString()
  const age = ageMinutes(slightFuture, NOW)
  assert.equal(age, 0, `expected 0 got ${age}`)
})

test('zero age (exactly now) returns 0', () => {
  const age = ageMinutes(new Date(NOW).toISOString(), NOW)
  assert.equal(age, 0)
})

// ── classify ─────────────────────────────────────────────────────────────────

console.log('\nclassify')

const FILE = 'latest.json'      // limit 30
const FILE_NO_LIMIT = 'labels.json'

test('fresh at exactly the limit (30 min)', () => {
  const r = classify(FILE, 200, isoMinsAgo(30), NOW)
  assert.equal(r.state, 'fresh')
  assert(r.ageMin !== null && Math.abs(r.ageMin - 30) < 0.01)
})

test('stale one minute over the limit (31 min)', () => {
  const r = classify(FILE, 200, isoMinsAgo(31), NOW)
  assert.equal(r.state, 'stale')
  assert(r.ageMin !== null && r.ageMin > 30)
})

test('missing on 404', () => {
  const r = classify(FILE, 404, undefined, NOW)
  assert.equal(r.state, 'missing')
  assert.equal(r.ageMin, null)
})

test('unknown on network error', () => {
  const r = classify(FILE, 'error', undefined, NOW)
  assert.equal(r.state, 'unknown')
})

test('unknown on other non-OK status (500)', () => {
  const r = classify(FILE, 500, isoMinsAgo(5), NOW)
  assert.equal(r.state, 'unknown')
})

test('unknown on missing/null generatedAt', () => {
  const r = classify(FILE, 200, null, NOW)
  assert.equal(r.state, 'unknown')
  assert.equal(r.ageMin, null)
})

test('unknown on non-string generatedAt (number)', () => {
  const r = classify(FILE, 200, 42, NOW)
  assert.equal(r.state, 'unknown')
})

test('unknown for file without a MAX_AGE_MIN entry', () => {
  const r = classify(FILE_NO_LIMIT, 200, isoMinsAgo(5), NOW)
  assert.equal(r.state, 'unknown')
})

test('agents.json is fresh at 180 min', () => {
  const r = classify('agents.json', 200, isoMinsAgo(180), NOW)
  assert.equal(r.state, 'fresh')
})

test('agents.json is stale at 181 min', () => {
  const r = classify('agents.json', 200, isoMinsAgo(181), NOW)
  assert.equal(r.state, 'stale')
})

// ── rowsToCheck ───────────────────────────────────────────────────────────────

console.log('\nrowsToCheck')

const MINI_CATALOG = [
  { file: 'latest.json',   title: 'Network snapshot',  nets: ['mainnet', 'testnet'] as ('mainnet' | 'testnet')[] },
  { file: 'fx.json',       title: 'FX rate',           nets: ['testnet'] as ('mainnet' | 'testnet')[] },
  { file: 'labels.json',   title: 'Address labels',    nets: ['mainnet', 'testnet'] as ('mainnet' | 'testnet')[] },
  { file: 'feed.xml',      title: 'RSS feed',          nets: ['mainnet', 'testnet'] as ('mainnet' | 'testnet')[] },
]

test('mainnet: includes mainnet files, excludes testnet-only (fx.json), excludes unchecked', () => {
  const rows = rowsToCheck(MINI_CATALOG, 'mainnet')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].file, 'latest.json')
})

test('testnet: includes testnet files (latest + fx), excludes unchecked (labels, feed)', () => {
  const rows = rowsToCheck(MINI_CATALOG, 'testnet')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].file, 'latest.json')
  assert.equal(rows[1].file, 'fx.json')
})

test('catalog order is preserved', () => {
  const catalog = [
    { file: 'supply.json',      title: 'Supply',   nets: ['mainnet', 'testnet'] as ('mainnet' | 'testnet')[] },
    { file: 'latest.json',      title: 'Latest',   nets: ['mainnet', 'testnet'] as ('mainnet' | 'testnet')[] },
    { file: 'balances.json',    title: 'Balances', nets: ['mainnet', 'testnet'] as ('mainnet' | 'testnet')[] },
  ]
  const rows = rowsToCheck(catalog, 'mainnet')
  assert.deepEqual(rows.map(r => r.file), ['supply.json', 'latest.json', 'balances.json'])
})

test('empty catalog returns empty array', () => {
  assert.deepEqual(rowsToCheck([], 'mainnet'), [])
})

// ── formatAge ────────────────────────────────────────────────────────────────

console.log('\nformatAge')

test('null → unknown', () => {
  assert.equal(formatAge(null), 'unknown')
})

test('0 → just now', () => {
  assert.equal(formatAge(0), 'just now')
})

test('0.5 → just now', () => {
  assert.equal(formatAge(0.5), 'just now')
})

test('1 → 1 min ago', () => {
  assert.equal(formatAge(1), '1 min ago')
})

test('59 → 59 min ago', () => {
  assert.equal(formatAge(59), '59 min ago')
})

test('60 → 1 h 00 min ago', () => {
  assert.equal(formatAge(60), '1 h 00 min ago')
})

test('185 → 3 h 05 min ago', () => {
  assert.equal(formatAge(185), '3 h 05 min ago')
})

test('1439 → 23 h 59 min ago', () => {
  assert.equal(formatAge(1439), '23 h 59 min ago')
})

test('1440 → 1 d 0 h ago', () => {
  assert.equal(formatAge(1440), '1 d 0 h ago')
})

test('3000 → 2 d 2 h ago (3000 / 1440 = 2d, rem 120 min = 2h)', () => {
  // 3000 / 1440 = 2 d, remainder 120 min = 2 h
  assert.equal(formatAge(3000), '2 d 2 h ago')
})

// ── summarize ────────────────────────────────────────────────────────────────

console.log('\nsummarize')

test('all fresh → "All N files fresh"', () => {
  const rows: { state: FreshState }[] = [
    { state: 'fresh' }, { state: 'fresh' }, { state: 'fresh' },
  ]
  assert.equal(summarize(rows), 'All 3 files fresh')
})

test('one stale → "1 of N files need attention"', () => {
  const rows: { state: FreshState }[] = [
    { state: 'fresh' }, { state: 'stale' }, { state: 'fresh' },
  ]
  assert.equal(summarize(rows), '1 of 3 files need attention')
})

test('missing and unknown both count as attention', () => {
  const rows: { state: FreshState }[] = [
    { state: 'fresh' }, { state: 'missing' }, { state: 'unknown' },
  ]
  assert.equal(summarize(rows), '2 of 3 files need attention')
})

test('all non-fresh', () => {
  const rows: { state: FreshState }[] = [
    { state: 'stale' }, { state: 'missing' },
  ]
  assert.equal(summarize(rows), '2 of 2 files need attention')
})

test('single fresh file', () => {
  assert.equal(summarize([{ state: 'fresh' }]), 'All 1 files fresh')
})

// ── CATALOG integrity ────────────────────────────────────────────────────────

console.log('\nCATALOG integrity (guards typos in MAX_AGE_MIN)')

test('every key in MAX_AGE_MIN exists as a file in CATALOG', () => {
  const catalogFiles = new Set(CATALOG.map((e: CatalogEntry) => e.file))
  const bad: string[] = []
  for (const key of Object.keys(MAX_AGE_MIN)) {
    if (!catalogFiles.has(key)) bad.push(key)
  }
  assert.deepEqual(bad, [], `MAX_AGE_MIN keys not found in CATALOG: ${bad.join(', ')}`)
})

test('timestampOf prefers generatedAt, falls back to updatedAt (state.json), else undefined', () => {
  assert.equal(timestampOf({ generatedAt: 'a', updatedAt: 'b' }), 'a')
  assert.equal(timestampOf({ updatedAt: 'b' }), 'b')
  assert.equal(timestampOf({}), undefined)
  assert.equal(timestampOf(null), undefined)
  assert.equal(timestampOf([1]), undefined)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
