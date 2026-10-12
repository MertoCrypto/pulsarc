/**
 * Tests for src/lib/agentsActivity.ts
 *
 * Run with:
 *   node --experimental-strip-types src/lib/agentsActivity.test.ts
 *
 * Samples are read from the directory pointed to by env AGENTS_ACTIVITY_SAMPLES
 * (default: src/lib/fixtures/catalog).  A missing sample file causes the test
 * to fail rather than skip.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseAgentsActivity,
  isActivityFresh,
  summarize,
  shortOwner,
  explorerAddressUrl,
  type AgentsActivity,
} from './agentsActivity.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const samplesDir = process.env['AGENTS_ACTIVITY_SAMPLES'] ?? 'src/lib/fixtures/catalog'

/** Load a sample JSON file.  Throws (failing the test) when the file is absent. */
function loadSample(filename: string): unknown {
  const p = resolve(samplesDir, filename)
  // readFileSync throws ENOENT when the file is missing, which fails the test.
  const text = readFileSync(p, 'utf8')
  return JSON.parse(text)
}

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ok  ${name}`)
    passed++
  } catch (err) {
    console.error(`  FAIL  ${name}`)
    console.error('       ', err instanceof Error ? err.message : String(err))
    failed++
  }
}

// ---------------------------------------------------------------------------
// Load real samples (missing file = hard failure, not a skip)
// ---------------------------------------------------------------------------

// These two calls are intentionally outside any try/catch so a missing file
// throws at the module level and the process exits non-zero immediately.
const rawMainnet = loadSample('mainnet-agents-activity.json')
const rawTestnet = loadSample('testnet-agents-activity.json')

const mainnet = parseAgentsActivity(rawMainnet)
const testnet = parseAgentsActivity(rawTestnet)

// ---------------------------------------------------------------------------
// Suite: parse real samples
// ---------------------------------------------------------------------------

console.log('\nparse real samples')

test('mainnet sample parses to non-null', () => {
  assert.notEqual(mainnet, null)
})

test('mainnet sample: correct totalAgents', () => {
  assert.equal(mainnet!.totalAgents, 2372)
})

test('mainnet sample: correct owners', () => {
  assert.equal(mainnet!.owners, 152)
})

test('mainnet sample: correct ownersMeasured', () => {
  assert.equal(mainnet!.ownersMeasured, 145)
})

test('mainnet sample: correct agentsMeasured', () => {
  assert.equal(mainnet!.agentsMeasured, 2364)
})

test('mainnet sample: correct ownersWithTx', () => {
  assert.equal(mainnet!.ownersWithTx, 143)
})

test('mainnet sample: correct ownersWithUsdc', () => {
  assert.equal(mainnet!.ownersWithUsdc, 115)
})

test('mainnet sample: correct agentsOfOwnersWithoutTx', () => {
  assert.equal(mainnet!.agentsOfOwnersWithoutTx, 2)
})

test('mainnet sample: top has 25 entries', () => {
  assert.equal(mainnet!.top.length, 25)
})

test('mainnet sample: top[0] owner correct', () => {
  assert.equal(mainnet!.top[0]!.owner, '0x26bd491560b5175ee8bd1da4998fe260ffc413c9')
})

test('mainnet sample: top[0] names correct (already <= 3)', () => {
  assert.deepEqual(mainnet!.top[0]!.names, ['Eve'])
})

test('testnet sample parses to non-null', () => {
  assert.notEqual(testnet, null)
})

test('testnet sample: correct totalAgents', () => {
  assert.equal(testnet!.totalAgents, 352000)
})

test('testnet sample: correct owners', () => {
  assert.equal(testnet!.owners, 23484)
})

test('testnet sample: correct ownersMeasured', () => {
  assert.equal(testnet!.ownersMeasured, 600)
})

test('testnet sample: top[2] owner correct', () => {
  assert.equal(testnet!.top[2]!.owner, '0x560829bcb0949c21ab736925b2b38d3532765728')
})

// ---------------------------------------------------------------------------
// Suite: rejection cases
// ---------------------------------------------------------------------------

console.log('\nrejection cases')

test('rejects non-object (string)', () => {
  assert.equal(parseAgentsActivity('hello'), null)
})

test('rejects non-object (null)', () => {
  assert.equal(parseAgentsActivity(null), null)
})

test('rejects non-object (array)', () => {
  assert.equal(parseAgentsActivity([]), null)
})

test('rejects missing network', () => {
  assert.equal(
    parseAgentsActivity({
      generatedAt: '2026-10-12T10:00:00Z',
      totalAgents: 1, owners: 1, ownersMeasured: 1,
      agentsMeasured: 1, ownersWithTx: 0, ownersWithUsdc: 0,
      agentsOfOwnersWithoutTx: 0, top: [],
    }),
    null,
  )
})

test('rejects negative totalAgents', () => {
  assert.equal(
    parseAgentsActivity({
      network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
      totalAgents: -1, owners: 1, ownersMeasured: 1,
      agentsMeasured: 1, ownersWithTx: 0, ownersWithUsdc: 0,
      agentsOfOwnersWithoutTx: 0, top: [],
    }),
    null,
  )
})

test('rejects non-integer totalAgents', () => {
  assert.equal(
    parseAgentsActivity({
      network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
      totalAgents: 1.5, owners: 1, ownersMeasured: 1,
      agentsMeasured: 1, ownersWithTx: 0, ownersWithUsdc: 0,
      agentsOfOwnersWithoutTx: 0, top: [],
    }),
    null,
  )
})

test('rejects ownersMeasured > owners', () => {
  assert.equal(
    parseAgentsActivity({
      network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
      totalAgents: 10, owners: 5, ownersMeasured: 6,
      agentsMeasured: 10, ownersWithTx: 0, ownersWithUsdc: 0,
      agentsOfOwnersWithoutTx: 0, top: [],
    }),
    null,
  )
})

test('rejects ownersWithTx > ownersMeasured', () => {
  assert.equal(
    parseAgentsActivity({
      network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
      totalAgents: 10, owners: 10, ownersMeasured: 5,
      agentsMeasured: 10, ownersWithTx: 6, ownersWithUsdc: 0,
      agentsOfOwnersWithoutTx: 0, top: [],
    }),
    null,
  )
})

// ---------------------------------------------------------------------------
// Suite: top entry validation — drop bad entries, keep order
// ---------------------------------------------------------------------------

console.log('\ntop entry validation')

const VALID_ENTRY = {
  owner: '0xabcdef1234567890abcdef1234567890abcdef12',
  agents: 2, txCount: 10, usdc: 1.5, firstId: 5, names: ['Alice'],
}
const VALID_ENTRY2 = {
  owner: '0x1111111111111111111111111111111111111111',
  agents: 1, txCount: 5, usdc: 0, firstId: 3, names: [],
}

test('drops entry with uppercase owner hex', () => {
  const doc = parseAgentsActivity({
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0,
    top: [
      { ...VALID_ENTRY },
      { owner: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12', agents: 1, txCount: 0, usdc: 0, firstId: 1, names: [] },
      { ...VALID_ENTRY2 },
    ],
  })
  // Bad entry dropped; valid ones kept in order
  assert.equal(doc!.top.length, 2)
  assert.equal(doc!.top[0]!.owner, VALID_ENTRY.owner)
  assert.equal(doc!.top[1]!.owner, VALID_ENTRY2.owner)
})

test('drops entry with negative agents', () => {
  const doc = parseAgentsActivity({
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0,
    top: [
      { ...VALID_ENTRY },
      { owner: '0x2222222222222222222222222222222222222222', agents: -1, txCount: 0, usdc: 0, firstId: 1, names: [] },
      { ...VALID_ENTRY2 },
    ],
  })
  assert.equal(doc!.top.length, 2)
  assert.equal(doc!.top[0]!.owner, VALID_ENTRY.owner)
  assert.equal(doc!.top[1]!.owner, VALID_ENTRY2.owner)
})

test('drops entry with missing names array', () => {
  const doc = parseAgentsActivity({
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0,
    top: [
      { ...VALID_ENTRY },
      { owner: '0x3333333333333333333333333333333333333333', agents: 1, txCount: 0, usdc: 0, firstId: 1 /* no names */ },
      { ...VALID_ENTRY2 },
    ],
  })
  assert.equal(doc!.top.length, 2)
})

test('cuts names to 60 chars', () => {
  const longName = 'A'.repeat(80)
  const doc = parseAgentsActivity({
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0,
    top: [{ ...VALID_ENTRY, names: [longName] }],
  })
  assert.equal(doc!.top[0]!.names[0]!.length, 60)
})

test('strips control characters from names', () => {
  const nameWithCtrl = 'Hello\u0001World\u001F!'
  const doc = parseAgentsActivity({
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0,
    top: [{ ...VALID_ENTRY, names: [nameWithCtrl] }],
  })
  assert.equal(doc!.top[0]!.names[0], 'HelloWorld!')
})

test('caps names array at 3 entries', () => {
  const doc = parseAgentsActivity({
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0,
    top: [{ ...VALID_ENTRY, names: ['A', 'B', 'C', 'D', 'E'] }],
  })
  assert.equal(doc!.top[0]!.names.length, 3)
  assert.deepEqual(doc!.top[0]!.names, ['A', 'B', 'C'])
})

test('drops non-string items in names array', () => {
  const doc = parseAgentsActivity({
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0,
    top: [{ ...VALID_ENTRY, names: ['Alice', 42, 'Bob'] }],
  })
  assert.deepEqual(doc!.top[0]!.names, ['Alice', 'Bob'])
})

// ---------------------------------------------------------------------------
// Suite: isActivityFresh
// ---------------------------------------------------------------------------

console.log('\nisActivityFresh')

function makeDoc(generatedAt: string): AgentsActivity {
  return {
    network: 'mainnet', generatedAt,
    totalAgents: 1, owners: 1, ownersMeasured: 1,
    agentsMeasured: 1, ownersWithTx: 0, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0, top: [],
  }
}

const BASE_TIME = Date.parse('2026-10-12T10:00:00Z') // fixed reference

test('fresh at 5h59m (< 6h)', () => {
  const genAt = new Date(BASE_TIME - (5 * 3600_000 + 59 * 60_000)).toISOString()
  assert.equal(isActivityFresh(makeDoc(genAt), BASE_TIME), true)
})

test('stale at 6h01m (> 6h)', () => {
  const genAt = new Date(BASE_TIME - (6 * 3600_000 + 1 * 60_000)).toISOString()
  assert.equal(isActivityFresh(makeDoc(genAt), BASE_TIME), false)
})

test('stale with unparseable generatedAt', () => {
  assert.equal(isActivityFresh(makeDoc('not-a-date'), BASE_TIME), false)
})

test('fresh at exactly 6h (boundary inclusive)', () => {
  const genAt = new Date(BASE_TIME - 6 * 3600_000).toISOString()
  assert.equal(isActivityFresh(makeDoc(genAt), BASE_TIME), true)
})

// ---------------------------------------------------------------------------
// Suite: summarize — mainnet (exact strings from raw numbers)
// ---------------------------------------------------------------------------

console.log('\nsummarize — mainnet')

// mainnet: totalAgents=2372, owners=152, ownersMeasured=145, agentsMeasured=2364,
//          ownersWithTx=143, agentsOfOwnersWithoutTx=2

test('mainnet ownersLine', () => {
  const { ownersLine } = summarize(mainnet!)
  const expected = '2,372 registered agents belong to 152 owner wallets'
  assert.equal(ownersLine, expected)
})

test('mainnet measuredLine present (ownersMeasured < owners)', () => {
  const { measuredLine } = summarize(mainnet!)
  const expected = 'Activity measured for the 145 owners holding the most agents (2,364 agents)'
  assert.equal(measuredLine, expected)
})

test('mainnet idleLine: 145-143=2 idle', () => {
  const { idleLine } = summarize(mainnet!)
  const expected = '2 of 145 measured owners have never sent a transaction (2 agents)'
  assert.equal(idleLine, expected)
})

// ---------------------------------------------------------------------------
// Suite: summarize — testnet (measuredLine present)
// ---------------------------------------------------------------------------

console.log('\nsummarize — testnet')

// testnet: totalAgents=352000, owners=23484, ownersMeasured=600,
//          agentsMeasured=82541, ownersWithTx=512, agentsOfOwnersWithoutTx=11532

test('testnet ownersLine', () => {
  const { ownersLine } = summarize(testnet!)
  const expected = '352,000 registered agents belong to 23,484 owner wallets'
  assert.equal(ownersLine, expected)
})

test('testnet measuredLine present', () => {
  const { measuredLine } = summarize(testnet!)
  const expected = 'Activity measured for the 600 owners holding the most agents (82,541 agents)'
  assert.equal(measuredLine, expected)
})

test('testnet idleLine: 600-512=88 idle', () => {
  const { idleLine } = summarize(testnet!)
  const expected = '88 of 600 measured owners have never sent a transaction (11,532 agents)'
  assert.equal(idleLine, expected)
})

// ---------------------------------------------------------------------------
// Suite: summarize — synthetic docs
// ---------------------------------------------------------------------------

console.log('\nsummarize — synthetic')

test('ownersMeasured = 0 → idleLine is null', () => {
  const doc: AgentsActivity = {
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 5, owners: 5, ownersMeasured: 0,
    agentsMeasured: 0, ownersWithTx: 0, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0, top: [],
  }
  const { idleLine } = summarize(doc)
  assert.equal(idleLine, null)
})

test('owners = 0 → measuredLine null (ownersMeasured cannot exceed owners=0)', () => {
  const doc: AgentsActivity = {
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 0, owners: 0, ownersMeasured: 0,
    agentsMeasured: 0, ownersWithTx: 0, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0, top: [],
  }
  const { measuredLine } = summarize(doc)
  assert.equal(measuredLine, null)
})

test('owners = 1 → singular "owner wallet"', () => {
  const doc: AgentsActivity = {
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 3, owners: 1, ownersMeasured: 1,
    agentsMeasured: 3, ownersWithTx: 1, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0, top: [],
  }
  const { ownersLine } = summarize(doc)
  assert.equal(ownersLine, '3 registered agents belong to 1 owner wallet')
})

test('ownersMeasured === owners → measuredLine is null', () => {
  const doc: AgentsActivity = {
    network: 'mainnet', generatedAt: '2026-10-12T10:00:00Z',
    totalAgents: 5, owners: 10, ownersMeasured: 10,
    agentsMeasured: 5, ownersWithTx: 8, ownersWithUsdc: 0,
    agentsOfOwnersWithoutTx: 0, top: [],
  }
  const { measuredLine } = summarize(doc)
  assert.equal(measuredLine, null)
})

// ---------------------------------------------------------------------------
// Suite: shortOwner
// ---------------------------------------------------------------------------

console.log('\nshortOwner')

test('shortOwner abbreviates correctly', () => {
  assert.equal(
    shortOwner('0x26bd491560b5175ee8bd1da4998fe260ffc413c9'),
    '0x26bd\u202613c9',  // first 6 chars: 0x26bd + … + last 4 chars: 13c9
  )
})

test('shortOwner: first 6 chars', () => {
  const addr = '0xabcdef1234567890abcdef1234567890abcdef12'
  assert.equal(shortOwner(addr).slice(0, 6), '0xabcd')
})

test('shortOwner: last 4 chars after ellipsis', () => {
  const addr = '0xabcdef1234567890abcdef1234567890abcdef12'
  const result = shortOwner(addr)
  // last 4 chars of addr are 'ef12'
  assert.equal(result.slice(-4), 'ef12')
})

// ---------------------------------------------------------------------------
// Suite: explorerAddressUrl
// ---------------------------------------------------------------------------

console.log('\nexplorerAddressUrl')

const ADDR = '0x26bd491560b5175ee8bd1da4998fe260ffc413c9'

test('mainnet URL', () => {
  assert.equal(
    explorerAddressUrl('mainnet', ADDR),
    `https://explorer.arc.io/address/${ADDR}`,
  )
})

test('testnet URL', () => {
  assert.equal(
    explorerAddressUrl('testnet', ADDR),
    `https://explorer.testnet.arc.io/address/${ADDR}`,
  )
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
