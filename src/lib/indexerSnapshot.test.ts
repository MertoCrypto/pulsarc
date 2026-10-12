/**
 * Tests for src/lib/indexerSnapshot.ts
 * Run: node --experimental-strip-types --no-warnings src/lib/indexerSnapshot.test.ts
 */

import assert from 'node:assert/strict'
import { parseIndexerSnapshot, parseLabels } from './indexerSnapshot.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function section(name: string) {
  console.log(`\n${name}`)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_CONTRACT = {
  address: '0xabcdef1234567890abcdef1234567890abcdef12',
  txs: 42,
  walletHours: 7,
  fees: 0.5,
}

const VALID_WINDOW = {
  hours: 1,
  blocks: 12,
  txs: 42,
  failed: 0,
  fees: 0.5,
  walletHours: 7,
  top: [VALID_CONTRACT],
}

const VALID_SERIES_ENTRY = {
  hour: '2026-10-10T07:00:00.000Z',
  txs: 10,
  failed: 1,
  fees: 0.1,
  wallets: 5,
  blocks: 6,
}

const VALID_SNAPSHOT = {
  generatedAt: '2026-10-10T08:00:00.000Z',
  windows: {
    '1h': { ...VALID_WINDOW },
    '24h': { ...VALID_WINDOW, hours: 24 },
    '7d': { ...VALID_WINDOW, hours: 168 },
  },
  series: [VALID_SERIES_ENTRY],
  // These fields should be ignored / overridden
  network: 'mainnet',
  labels: {},
}

function snap(overrides: Record<string, unknown> = {}) {
  return { ...VALID_SNAPSHOT, ...overrides }
}

// ── parseIndexerSnapshot — happy path ─────────────────────────────────────────

section('parseIndexerSnapshot — happy path')

test('parses a valid testnet snapshot', () => {
  const result = parseIndexerSnapshot(VALID_SNAPSHOT, 'testnet')
  assert.ok(result !== null)
  assert.equal(result.network, 'testnet')
  assert.equal(result.generatedAt, '2026-10-10T08:00:00.000Z')
  assert.ok(result.windows['1h'] !== undefined)
  assert.equal(result.windows['1h'].txs, 42)
  assert.equal(result.series.length, 1)
  assert.equal(result.series[0].hour, VALID_SERIES_ENTRY.hour)
})

test('parses a valid mainnet snapshot', () => {
  const result = parseIndexerSnapshot(VALID_SNAPSHOT, 'mainnet')
  assert.ok(result !== null)
  assert.equal(result.network, 'mainnet')
})

test('net argument overrides any network field in JSON', () => {
  // JSON says mainnet, but net arg says testnet
  const result = parseIndexerSnapshot(snap({ network: 'mainnet' }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.network, 'testnet')
})

test('top contracts are included', () => {
  const result = parseIndexerSnapshot(VALID_SNAPSHOT, 'testnet')
  assert.ok(result !== null)
  assert.equal(result.windows['1h'].top.length, 1)
  assert.equal(result.windows['1h'].top[0].address, VALID_CONTRACT.address.toLowerCase())
})

test('series entries are parsed', () => {
  const result = parseIndexerSnapshot(VALID_SNAPSHOT, 'testnet')
  assert.ok(result !== null)
  assert.equal(result.series[0].txs, 10)
  assert.equal(result.series[0].wallets, 5)
})

test('result has no labels key', () => {
  const result = parseIndexerSnapshot(VALID_SNAPSHOT, 'testnet')
  assert.ok(result !== null)
  assert.ok(!('labels' in result))
})

// ── parseIndexerSnapshot — null-return conditions ─────────────────────────────

section('parseIndexerSnapshot — null-return conditions')

test('returns null for null input', () => assert.equal(parseIndexerSnapshot(null, 'testnet'), null))
test('returns null for array input', () => assert.equal(parseIndexerSnapshot([], 'testnet'), null))
test('returns null for string input', () => assert.equal(parseIndexerSnapshot('hello', 'testnet'), null))
test('returns null for number input', () => assert.equal(parseIndexerSnapshot(42, 'testnet'), null))

test('returns null when generatedAt is missing', () => {
  assert.equal(parseIndexerSnapshot(snap({ generatedAt: undefined }), 'testnet'), null)
})

test('returns null when generatedAt is not a string', () => {
  assert.equal(parseIndexerSnapshot(snap({ generatedAt: 123 }), 'testnet'), null)
})

test('returns null when generatedAt is empty string', () => {
  assert.equal(parseIndexerSnapshot(snap({ generatedAt: '' }), 'testnet'), null)
})

test('returns null when windows is missing', () => {
  assert.equal(parseIndexerSnapshot(snap({ windows: undefined }), 'testnet'), null)
})

test('returns null when windows is an array', () => {
  assert.equal(parseIndexerSnapshot(snap({ windows: [] }), 'testnet'), null)
})

test('returns null when windows is a string', () => {
  assert.equal(parseIndexerSnapshot(snap({ windows: 'bad' }), 'testnet'), null)
})

test('returns null when 1h window is missing', () => {
  const { '1h': _removed, ...rest } = VALID_SNAPSHOT.windows
  assert.equal(parseIndexerSnapshot(snap({ windows: rest }), 'testnet'), null)
})

test('returns null when 24h window is missing', () => {
  const { '24h': _removed, ...rest } = VALID_SNAPSHOT.windows
  assert.equal(parseIndexerSnapshot(snap({ windows: rest }), 'testnet'), null)
})

test('returns null when 7d window is missing', () => {
  const { '7d': _removed, ...rest } = VALID_SNAPSHOT.windows
  assert.equal(parseIndexerSnapshot(snap({ windows: rest }), 'testnet'), null)
})

test('returns null when a window has missing hours', () => {
  const badWindow = { ...VALID_WINDOW, hours: undefined }
  assert.equal(parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': badWindow } }), 'testnet'), null)
})

test('returns null when a window has missing top', () => {
  const badWindow = { ...VALID_WINDOW, top: undefined }
  assert.equal(parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': badWindow } }), 'testnet'), null)
})

test('returns null when series is missing', () => {
  assert.equal(parseIndexerSnapshot(snap({ series: undefined }), 'testnet'), null)
})

test('returns null when series is not an array', () => {
  assert.equal(parseIndexerSnapshot(snap({ series: {} }), 'testnet'), null)
})

// ── parseIndexerSnapshot — NaN / Infinity / negative rejection ────────────────

section('parseIndexerSnapshot — bad numeric values')

test('rejects NaN in window txs', () => {
  const badWindow = { ...VALID_WINDOW, txs: NaN }
  assert.equal(parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': badWindow } }), 'testnet'), null)
})

test('rejects Infinity in window fees', () => {
  const badWindow = { ...VALID_WINDOW, fees: Infinity }
  assert.equal(parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': badWindow } }), 'testnet'), null)
})

test('rejects negative in window blocks', () => {
  const badWindow = { ...VALID_WINDOW, blocks: -1 }
  assert.equal(parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': badWindow } }), 'testnet'), null)
})

test('rejects string number in window txs', () => {
  const badWindow = { ...VALID_WINDOW, txs: '42' }
  assert.equal(parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': badWindow } }), 'testnet'), null)
})

// ── parseIndexerSnapshot — dropped bad entries keep good ones ─────────────────

section('parseIndexerSnapshot — dropped bad entries keep good ones')

test('drops malformed top entry, keeps valid one', () => {
  const badContract = { address: 'not-an-address', txs: 1, walletHours: 1, fees: 0 }
  const window1h = { ...VALID_WINDOW, top: [badContract, VALID_CONTRACT] }
  const result = parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': window1h } }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.windows['1h'].top.length, 1)
  assert.equal(result.windows['1h'].top[0].address, VALID_CONTRACT.address.toLowerCase())
})

test('drops top entry with NaN txs, keeps valid one', () => {
  const badContract = { ...VALID_CONTRACT, txs: NaN }
  const window1h = { ...VALID_WINDOW, top: [badContract, VALID_CONTRACT] }
  const result = parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': window1h } }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.windows['1h'].top.length, 1)
})

test('drops malformed series entry, keeps valid one', () => {
  const badEntry = { hour: '', txs: 1, failed: 0, fees: 0, wallets: 1, blocks: 1 }
  const result = parseIndexerSnapshot(snap({ series: [badEntry, VALID_SERIES_ENTRY] }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.series.length, 1)
  assert.equal(result.series[0].hour, VALID_SERIES_ENTRY.hour)
})

test('drops series entry with Infinity fees, keeps valid one', () => {
  const badEntry = { ...VALID_SERIES_ENTRY, fees: Infinity }
  const result = parseIndexerSnapshot(snap({ series: [badEntry, VALID_SERIES_ENTRY] }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.series.length, 1)
})

test('drops series entry with negative wallets, keeps valid one', () => {
  const badEntry = { ...VALID_SERIES_ENTRY, wallets: -1 }
  const result = parseIndexerSnapshot(snap({ series: [badEntry, VALID_SERIES_ENTRY] }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.series.length, 1)
})

test('drops series entry with string txs, keeps valid one', () => {
  const badEntry = { ...VALID_SERIES_ENTRY, txs: '10' }
  const result = parseIndexerSnapshot(snap({ series: [badEntry, VALID_SERIES_ENTRY] }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.series.length, 1)
})

test('empty series array is valid', () => {
  const result = parseIndexerSnapshot(snap({ series: [] }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.series.length, 0)
})

test('empty top array is valid', () => {
  const window1h = { ...VALID_WINDOW, top: [] }
  const result = parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': window1h } }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.windows['1h'].top.length, 0)
})

// ── parseIndexerSnapshot — address normalisation ──────────────────────────────

section('parseIndexerSnapshot — address normalisation')

test('normalises contract address to lowercase', () => {
  const upperContract = { ...VALID_CONTRACT, address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' }
  const window1h = { ...VALID_WINDOW, top: [upperContract] }
  const result = parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': window1h } }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.windows['1h'].top[0].address, '0xabcdef1234567890abcdef1234567890abcdef12')
})

test('drops contract with missing 0x prefix', () => {
  const badContract = { ...VALID_CONTRACT, address: 'abcdef1234567890abcdef1234567890abcdef12' }
  const window1h = { ...VALID_WINDOW, top: [badContract] }
  const result = parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': window1h } }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.windows['1h'].top.length, 0)
})

test('drops contract with too-short address', () => {
  const badContract = { ...VALID_CONTRACT, address: '0xabcdef' }
  const window1h = { ...VALID_WINDOW, top: [badContract] }
  const result = parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': window1h } }), 'testnet')
  assert.ok(result !== null)
  assert.equal(result.windows['1h'].top.length, 0)
})

// ── parseIndexerSnapshot — __proto__ key protection ───────────────────────────

section('parseIndexerSnapshot — __proto__ key protection')

test('ignores __proto__ key in top-level object', () => {
  const hostile = JSON.parse('{"generatedAt":"2026-10-10T08:00:00.000Z","__proto__":{"evil":true},"windows":' +
    JSON.stringify(VALID_SNAPSHOT.windows) + ',"series":[]}')
  const result = parseIndexerSnapshot(hostile, 'testnet')
  // Should either return null (missing generatedAt slot from parse) or a valid result without pollution
  // The key thing is it must not throw and must not pollute Object.prototype
  assert.equal((Object.prototype as Record<string, unknown>)['evil'], undefined)
})

test('ignores __proto__ key in contract entry', () => {
  const hostile = JSON.parse('{"address":"0xabcdef1234567890abcdef1234567890abcdef12","txs":1,"walletHours":1,"fees":0,"__proto__":{"evil2":true}}')
  // parseIndexerSnapshot wrapping:
  const window1h = { ...VALID_WINDOW, top: [hostile] }
  parseIndexerSnapshot(snap({ windows: { ...VALID_SNAPSHOT.windows, '1h': window1h } }), 'testnet')
  assert.equal((Object.prototype as Record<string, unknown>)['evil2'], undefined)
})

// ── parseLabels — happy path ───────────────────────────────────────────────────

section('parseLabels — happy path')

const VALID_LABEL_ADDR = '0xabcdef1234567890abcdef1234567890abcdef12'

const VALID_LABELS = {
  [VALID_LABEL_ADDR]: {
    contract: true,
    name: 'MyToken',
    symbol: 'MTK',
    kind: 'ERC-20',
  },
}

test('parses a valid labels object', () => {
  const result = parseLabels(VALID_LABELS)
  assert.ok(VALID_LABEL_ADDR in result)
  const label = result[VALID_LABEL_ADDR]
  assert.equal(label.contract, true)
  assert.equal(label.name, 'MyToken')
  assert.equal(label.symbol, 'MTK')
  assert.equal(label.kind, 'ERC-20')
})

test('accepts contract: false', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: false, name: 'X', symbol: null } })
  assert.equal(result[VALID_LABEL_ADDR].contract, false)
})

test('name and symbol can be null', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: null, symbol: null } })
  assert.equal(result[VALID_LABEL_ADDR].name, null)
  assert.equal(result[VALID_LABEL_ADDR].symbol, null)
})

test('kind is optional — absent when not provided', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: null, symbol: null } })
  assert.equal(result[VALID_LABEL_ADDR].kind, undefined)
})

test('kind is omitted when not a string', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: null, symbol: null, kind: 42 } })
  assert.equal(result[VALID_LABEL_ADDR].kind, undefined)
})

// ── parseLabels — non-object inputs ───────────────────────────────────────────

section('parseLabels — non-object inputs')

test('returns {} for null input', () => assert.deepEqual(parseLabels(null), {}))
test('returns {} for array input', () => assert.deepEqual(parseLabels([]), {}))
test('returns {} for string input', () => assert.deepEqual(parseLabels('hello'), {}))
test('returns {} for number input', () => assert.deepEqual(parseLabels(42), {}))
test('returns {} for undefined input', () => assert.deepEqual(parseLabels(undefined), {}))
test('returns {} for boolean input', () => assert.deepEqual(parseLabels(true), {}))

// ── parseLabels — key validation ──────────────────────────────────────────────

section('parseLabels — key validation')

test('normalises uppercase address key to lowercase', () => {
  const upper = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'
  const result = parseLabels({ [upper]: { contract: true, name: 'X', symbol: null } })
  const lower = upper.toLowerCase()
  assert.ok(lower in result)
  assert.ok(!(upper in result))
})

test('skips non-address key', () => {
  const result = parseLabels({ 'not-an-address': { contract: true, name: 'X', symbol: null } })
  assert.deepEqual(result, {})
})

test('skips key that is too short', () => {
  const result = parseLabels({ '0xabcdef': { contract: true, name: 'X', symbol: null } })
  assert.deepEqual(result, {})
})

test('skips __proto__ key', () => {
  // Use a pre-parsed object to avoid JSON.parse prototype issues
  const hostile: Record<string, unknown> = Object.create(null)
  // Simulate a key named __proto__ directly on the object
  Object.defineProperty(hostile, '__proto__', {
    value: { contract: true, name: 'bad', symbol: null },
    enumerable: true,
    configurable: true,
    writable: true,
  })
  const result = parseLabels(hostile)
  assert.equal((Object.prototype as Record<string, unknown>)['name'], undefined)
  // Result should be empty (no valid address keys)
  assert.deepEqual(result, {})
})

// ── parseLabels — entry validation ────────────────────────────────────────────

section('parseLabels — entry validation')

const ADDR2 = '0x1111111111111111111111111111111111111111'
const ADDR3 = '0x2222222222222222222222222222222222222222'

test('skips entry where contract is missing', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { name: 'X', symbol: null } })
  assert.deepEqual(result, {})
})

test('skips entry where contract is not boolean', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: 1, name: 'X', symbol: null } })
  assert.deepEqual(result, {})
})

test('skips entry that is not an object', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: 'bad' })
  assert.deepEqual(result, {})
})

test('skips entry that is an array', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: ['contract', true] })
  assert.deepEqual(result, {})
})

test('coerces non-string name to null', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: 99, symbol: null } })
  assert.equal(result[VALID_LABEL_ADDR].name, null)
})

test('coerces boolean symbol to null', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: null, symbol: true } })
  assert.equal(result[VALID_LABEL_ADDR].symbol, null)
})

test('coerces object name to null', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: {}, symbol: null } })
  assert.equal(result[VALID_LABEL_ADDR].name, null)
})

test('keeps valid entry alongside skipped one', () => {
  const result = parseLabels({
    [VALID_LABEL_ADDR]: { contract: true, name: 'Good', symbol: null },
    [ADDR2]: { name: 'No contract bool', symbol: null },
  })
  assert.ok(VALID_LABEL_ADDR in result)
  assert.ok(!(ADDR2 in result))
})

// ── parseLabels — string caps ──────────────────────────────────────────────────

section('parseLabels — string caps')

test('caps name at 80 chars', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: 'a'.repeat(200), symbol: null } })
  assert.equal(result[VALID_LABEL_ADDR].name?.length, 80)
})

test('caps symbol at 80 chars', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: null, symbol: 'b'.repeat(200) } })
  assert.equal(result[VALID_LABEL_ADDR].symbol?.length, 80)
})

test('caps kind at 32 chars', () => {
  const result = parseLabels({ [VALID_LABEL_ADDR]: { contract: true, name: null, symbol: null, kind: 'c'.repeat(100) } })
  assert.equal(result[VALID_LABEL_ADDR].kind?.length, 32)
})

test('multiple valid addresses all parsed', () => {
  const result = parseLabels({
    [VALID_LABEL_ADDR]: { contract: true, name: 'A', symbol: null },
    [ADDR2]: { contract: false, name: null, symbol: 'B' },
    [ADDR3]: { contract: true, name: null, symbol: null, kind: 'NFT' },
  })
  assert.equal(Object.keys(result).length, 3)
  assert.equal(result[ADDR2].symbol, 'B')
  assert.equal(result[ADDR3].kind, 'NFT')
})

test('a non-string contract address inside top is dropped, not thrown on', () => {
  const w = (VALID_SNAPSHOT as any).windows['1h']
  const bad = snap({ windows: { ...(VALID_SNAPSHOT as any).windows, '1h': { ...w, top: [{ address: 12345, txs: 1, walletHours: 1, fees: 1 }, ...w.top] } } })
  const r = parseIndexerSnapshot(bad, 'testnet')
  assert.ok(r !== null)
  assert.equal(r.windows['1h'].top.length, w.top.length)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
