/**
 * Tests for src/lib/agentsIndex.ts
 * Run: node --experimental-strip-types src/lib/agentsIndex.test.ts
 */

import assert from 'node:assert/strict'
import {
  parseAgentsIndex,
  searchAgents,
  sortAgents,
  pageOf,
} from './agentsIndex.ts'

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

const VALID_AGENT = {
  id: 1,
  owner: '0xabcdef1234567890abcdef1234567890abcdef12',
  name: 'Test Agent',
  description: 'Does things.',
  uri: 'https://example.com/agent',
}

const VALID_FILE = {
  network: 'testnet',
  generatedAt: '2026-10-10T07:42:19.213Z',
  registry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  lastId: 100,
  caughtUp: true,
  count: 1,
  agents: [VALID_AGENT],
}

function validFile(overrides: Record<string, unknown> = {}) {
  return { ...VALID_FILE, ...overrides }
}

// ── parseAgentsIndex ──────────────────────────────────────────────────────────

section('parseAgentsIndex — valid file')

test('parses a valid testnet file', () => {
  const result = parseAgentsIndex(VALID_FILE)
  assert.ok(result !== null)
  assert.equal(result.network, 'testnet')
  assert.equal(result.lastId, 100)
  assert.equal(result.caughtUp, true)
  assert.equal(result.agents.length, 1)
  assert.equal(result.agents[0].id, 1)
  assert.equal(result.agents[0].name, 'Test Agent')
})

test('parses caughtUp: false', () => {
  const result = parseAgentsIndex(validFile({ caughtUp: false }))
  assert.ok(result !== null)
  assert.equal(result.caughtUp, false)
})

test('accepts mainnet with empty agents array', () => {
  const result = parseAgentsIndex(validFile({ network: 'mainnet', agents: [] }))
  assert.ok(result !== null)
  assert.equal(result.agents.length, 0)
})

test('lowercases uppercase owner', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, owner: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].owner, '0xabcdef1234567890abcdef1234567890abcdef12')
})

section('parseAgentsIndex — top-level validation')

test('returns null for null input', () => assert.equal(parseAgentsIndex(null), null))
test('returns null for string input', () => assert.equal(parseAgentsIndex('hello'), null))
test('returns null when network is missing', () => assert.equal(parseAgentsIndex(validFile({ network: undefined })), null))
test('returns null when network is unknown', () => assert.equal(parseAgentsIndex(validFile({ network: 'polygon' })), null))
test('returns null when generatedAt is missing', () => assert.equal(parseAgentsIndex(validFile({ generatedAt: undefined })), null))
test('returns null when agents is not an array', () => assert.equal(parseAgentsIndex(validFile({ agents: {} })), null))
test('returns null when lastId is negative', () => assert.equal(parseAgentsIndex(validFile({ lastId: -1 })), null))
test('returns null when caughtUp is not boolean', () => assert.equal(parseAgentsIndex(validFile({ caughtUp: 'yes' })), null))

section('parseAgentsIndex — malformed agents dropped')

test('drops agent with non-positive id', () => {
  const result = parseAgentsIndex(validFile({ agents: [{ ...VALID_AGENT, id: 0 }] }))
  assert.ok(result !== null)
  assert.equal(result.agents.length, 0)
})

test('drops agent with invalid owner format', () => {
  const result = parseAgentsIndex(validFile({ agents: [{ ...VALID_AGENT, owner: 'not-an-address' }] }))
  assert.ok(result !== null)
  assert.equal(result.agents.length, 0)
})

test('drops agent with missing owner', () => {
  const result = parseAgentsIndex(validFile({ agents: [{ id: 1 }] }))
  assert.ok(result !== null)
  assert.equal(result.agents.length, 0)
})

test('keeps valid agent alongside malformed one', () => {
  const result = parseAgentsIndex(validFile({ agents: [VALID_AGENT, { id: 'bad' }] }))
  assert.ok(result !== null)
  assert.equal(result.agents.length, 1)
})

section('parseAgentsIndex — hostile strings')

test('strips control characters from name', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, name: 'Good\x00Bad\x1f' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].name, 'GoodBad')
})

test('caps name at 80 chars', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, name: 'a'.repeat(200) }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].name?.length, 80)
})

test('caps description at 280 chars', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, description: 'b'.repeat(500) }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].description?.length, 280)
})

test('rejects javascript: URI', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'javascript:alert(1)' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('rejects data: URI', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'data:text/html,<script>' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('converts ipfs:// URI to https://ipfs.io/ipfs/', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'ipfs://QmTestCID123' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, 'https://ipfs.io/ipfs/QmTestCID123')
})

test('keeps https:// URI as-is', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'https://example.com/agent' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, 'https://example.com/agent')
})

test('rejects <script> in name (no HTML injection possible — plain text only)', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, name: '<script>alert(1)</script>' }],
  }))
  assert.ok(result !== null)
  // Parser keeps it; renderer must use plain text (this tests the parser doesn't throw)
  assert.ok(result.agents[0].name?.includes('<script>'))
})

section('parseAgentsIndex — sanitiseUri stricter rules')

test('accepts a valid IPFS CID', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, 'https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
})

test('rejects ipfs://../../etc (path-traversal dots at root)', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'ipfs://../../etc' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('rejects ipfs://bafy/a/../b (dot-dot segment inside path)', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'ipfs://bafy/a/../b' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('rejects ipfs:// paths with characters outside the CID/path allow-list', () => {
  for (const uri of ['ipfs://bafy?x=1', 'ipfs://bafy#frag', 'ipfs://ba fy', 'ipfs://bafy/a b', 'ipfs://%2e%2e/etc', 'ipfs://bafy//x', 'ipfs:///bafy']) {
    const result = parseAgentsIndex(validFile({ agents: [{ ...VALID_AGENT, uri }] }))
    assert.ok(result !== null)
    assert.equal(result.agents[0].uri, undefined, uri)
  }
})

test('rejects ipfs:// paths longer than 256 characters', () => {
  const result = parseAgentsIndex(validFile({ agents: [{ ...VALID_AGENT, uri: 'ipfs://' + 'a'.repeat(257) }] }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('rejects https:// with userinfo (user:password@host)', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'https://user:secret@example.com/path' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('rejects bare "https://" (unparseable URL)', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'https://' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('javascript: URI is still rejected', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'javascript:alert(1)' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('data: URI is still rejected', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'data:text/html,<script>' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, undefined)
})

test('valid https:// URI is preserved', () => {
  const result = parseAgentsIndex(validFile({
    agents: [{ ...VALID_AGENT, uri: 'https://example.com/agent/card.json' }],
  }))
  assert.ok(result !== null)
  assert.equal(result.agents[0].uri, 'https://example.com/agent/card.json')
})

// ── searchAgents ──────────────────────────────────────────────────────────────

section('searchAgents')

const SEARCH_AGENTS = [
  { id: 1, owner: '0xaaaa000000000000000000000000000000000001', name: 'Alpha Bot', description: 'Monitors prices' },
  { id: 2, owner: '0xbbbb000000000000000000000000000000000002', name: 'Beta Agent', description: 'Sends alerts' },
  { id: 99, owner: '0xcccc000000000000000000000000000000000099', description: 'Unnamed but described' },
]

test('empty query returns all agents', () => {
  assert.equal(searchAgents(SEARCH_AGENTS, '').length, 3)
})

test('matches by name (case-insensitive)', () => {
  const r = searchAgents(SEARCH_AGENTS, 'alpha')
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 1)
})

test('matches by description', () => {
  const r = searchAgents(SEARCH_AGENTS, 'alerts')
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 2)
})

test('matches by owner substring', () => {
  const r = searchAgents(SEARCH_AGENTS, 'bbbb')
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 2)
})

test('exact numeric query matches id', () => {
  const r = searchAgents(SEARCH_AGENTS, '99')
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 99)
})

test('no match returns empty array', () => {
  assert.equal(searchAgents(SEARCH_AGENTS, 'zzznomatch').length, 0)
})

// ── sortAgents ────────────────────────────────────────────────────────────────

section('sortAgents')

const SORT_AGENTS = [
  { id: 3, owner: '0xaaaa000000000000000000000000000000000003', name: 'Charlie' },
  { id: 1, owner: '0xaaaa000000000000000000000000000000000001' },
  { id: 2, owner: '0xaaaa000000000000000000000000000000000002', name: 'Bob' },
]

test('newest: descending id', () => {
  const r = sortAgents(SORT_AGENTS, 'newest')
  assert.deepEqual(r.map(a => a.id), [3, 2, 1])
})

test('oldest: ascending id', () => {
  const r = sortAgents(SORT_AGENTS, 'oldest')
  assert.deepEqual(r.map(a => a.id), [1, 2, 3])
})

test('named: agents with name first, then descending id', () => {
  const r = sortAgents(SORT_AGENTS, 'named')
  // named: Charlie(3), Bob(2) first; then unnamed(1)
  assert.equal(r[0].name, 'Charlie')
  assert.equal(r[1].name, 'Bob')
  assert.equal(r[2].id, 1)
})

test('does not mutate the input array', () => {
  const input = [...SORT_AGENTS]
  sortAgents(input, 'newest')
  assert.deepEqual(input, SORT_AGENTS)
})

// ── pageOf ────────────────────────────────────────────────────────────────────

section('pageOf')

const ITEMS = [1, 2, 3, 4, 5, 6, 7]

test('first page', () => assert.deepEqual(pageOf(ITEMS, 1, 3), [1, 2, 3]))
test('second page', () => assert.deepEqual(pageOf(ITEMS, 2, 3), [4, 5, 6]))
test('last partial page', () => assert.deepEqual(pageOf(ITEMS, 3, 3), [7]))
test('out-of-range page returns empty', () => assert.deepEqual(pageOf(ITEMS, 10, 3), []))
test('page 0 returns empty', () => assert.deepEqual(pageOf(ITEMS, 0, 3), []))
test('size 0 returns empty', () => assert.deepEqual(pageOf(ITEMS, 1, 0), []))

section('parseAgentsIndex — names cannot disguise themselves')

test('direction-override and zero-width characters are removed from name and description', () => {
  const result = parseAgentsIndex(validFile({ agents: [{ ...VALID_AGENT, name: '\u202EtnegA\u200B lacoL', description: 'a\u2066b\uFEFFc' }] }))
  assert.ok(result !== null)
  assert.equal(result.agents[0]?.name, 'tnegA lacoL')
  assert.equal(result.agents[0]?.description, 'abc')
})

test('a name made only of invisible characters is dropped', () => {
  const result = parseAgentsIndex(validFile({ agents: [{ ...VALID_AGENT, name: '\u200B\u202E' }] }))
  assert.ok(result !== null)
  assert.equal(result.agents[0]?.name, undefined)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
