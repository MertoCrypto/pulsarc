// Run: node --experimental-strip-types src/lib/chainPorts.test.ts
import assert from 'node:assert/strict'
import { CCTP_DOMAINS, domainName } from './bridgeFlow.ts'
import { PORT_DOMAINS, portIconKey, portInitials } from './chainPorts.ts'

// ── ports ───────────────────────────────────────────────────────────────────
assert.deepEqual(PORT_DOMAINS.slice(0, 7), [0, 6, 3, 5, 2, 7, 1], 'Ethereum, Base, Arbitrum, Solana, OP Mainnet, Polygon PoS, Avalanche')
assert.deepEqual(PORT_DOMAINS.slice(0, 7).map(domainName), ['Ethereum', 'Base', 'Arbitrum', 'Solana', 'OP Mainnet', 'Polygon PoS', 'Avalanche'])
assert.ok(!PORT_DOMAINS.includes(26), 'Arc itself is not a port')
assert.ok(!PORT_DOMAINS.includes(-1), 'the unknown-source sentinel is not a port')
assert.equal(new Set(PORT_DOMAINS).size, PORT_DOMAINS.length, 'no duplicates')
for (const d of PORT_DOMAINS) assert.ok(d in CCTP_DOMAINS, `domain ${d} exists in CCTP_DOMAINS`)

// Every CCTP domain except Arc and −1 is a port.
const expected = Object.keys(CCTP_DOMAINS).map(Number).filter(d => d !== 26 && d !== -1).sort((a, b) => a - b)
assert.deepEqual([...PORT_DOMAINS].sort((a, b) => a - b), expected, 'all other CCTP domains are present')
assert.equal(PORT_DOMAINS.length, 31)

// After the first seven the rest follow by id.
const rest = PORT_DOMAINS.slice(7)
assert.deepEqual(rest, [...rest].sort((a, b) => a - b), 'the rest are ordered by id')
assert.equal(rest[0], 4)
assert.equal(rest[rest.length - 1], 37)
assert.equal(PORT_DOMAINS[9], 9, 'mobile shows the first ten: …, Noble, Sui, Aptos')

// ── icons ───────────────────────────────────────────────────────────────────
assert.equal(portIconKey(6), 'NetworkBase')
assert.equal(portIconKey(0), 'NetworkEthereum')
assert.equal(portIconKey(3), 'NetworkArbitrumOne')
assert.equal(portIconKey(37), 'NetworkXLayer')
assert.equal(portIconKey(4), null, 'Noble has no icon')
assert.equal(portIconKey(28), null, 'EDGE has no icon')
assert.equal(portIconKey(30), null, 'Morph has no icon')
assert.equal(portIconKey(31), null, 'Pharos has no icon')
assert.equal(portIconKey(999), null, 'unknown domains have no icon')
assert.equal(portIconKey(26), null, 'Arc is drawn as the core, not as a port')
assert.equal(portIconKey(-1), null)

const keys = PORT_DOMAINS.map(portIconKey).filter((k): k is string => k !== null)
assert.equal(new Set(keys).size, keys.length, 'one distinct icon per domain')
assert.ok(keys.every(k => /^Network[A-Za-z]+$/.test(k)))
assert.equal(PORT_DOMAINS.filter(d => portIconKey(d) === null).length, 4, 'exactly Noble, EDGE, Morph and Pharos fall back to initials')

// ── initials ────────────────────────────────────────────────────────────────
assert.equal(portInitials('Morph'), 'MOR')
assert.equal(portInitials('EDGE'), 'EDG')
assert.equal(portInitials('X Layer'), 'XLA')
assert.equal(portInitials('Noble'), 'NOB')

console.log('chainPorts.test.ts: all assertions passed')
