// Run: node --experimental-strip-types src/lib/bridgeLive.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  BRIDGE_ADDRESSES,
  BRIDGE_TOPICS,
  NON_EVM,
  decodeBridgeLogs,
  dedupeMoves,
  summarise,
  type BridgeLogLike,
} from './bridgeLive.ts'

// ── Fixture loader ─────────────────────────────────────────────────────────────

const fixtureDir = resolve(import.meta.dirname ?? '.', './fixtures/bridges')

function fixture(name: string): BridgeLogLike[] {
  const f = JSON.parse(readFileSync(resolve(fixtureDir, `${name}.json`), 'utf8')) as {
    txHash: string
    logs: Array<{
      address: string
      topics: string[]
      data: string
      logIndex: string
      transactionHash: string
    }>
  }
  return f.logs.map(l => ({
    address: l.address,
    topics: l.topics,
    data: l.data,
    transactionHash: l.transactionHash,
  }))
}

const close = (a: number | null, e: number, eps = 1e-5) =>
  assert.ok(a !== null && Math.abs(a - e) <= eps, `expected ~${e}, got ${String(a)}`)

// ── 1. gateway-burn-arbitrum → out, chain 42161, 18999.9965 ───────────────────

{
  const moves = decodeBridgeLogs(fixture('gateway-burn-arbitrum'), 'mainnet')
  const gw = moves.filter(m => m.bridge === 'gateway')
  assert.equal(gw.length, 1, 'gateway-burn-arbitrum: one gateway move')
  assert.equal(gw[0].direction, 'out')
  assert.equal(gw[0].chainId, 42161)
  close(gw[0].usdc, 18999.9965)
}

// ── 2. gateway-burn-base → out, 8453, 37153.238145 ───────────────────────────

{
  const moves = decodeBridgeLogs(fixture('gateway-burn-base'), 'mainnet')
  const gw = moves.filter(m => m.bridge === 'gateway')
  assert.equal(gw.length, 1, 'gateway-burn-base: one gateway move')
  assert.equal(gw[0].direction, 'out')
  assert.equal(gw[0].chainId, 8453)
  close(gw[0].usdc, 37153.238145)
}

// ── 3. gateway-attest-arc → excluded (domain 26) ─────────────────────────────

{
  const moves = decodeBridgeLogs(fixture('gateway-attest-arc'), 'mainnet')
  const gw = moves.filter(m => m.bridge === 'gateway')
  assert.equal(gw.length, 0, 'gateway-attest-arc: domain 26 excluded')
}

// ── 4. gateway-attest-solana → in, −5, 7.730000 ──────────────────────────────

{
  const moves = decodeBridgeLogs(fixture('gateway-attest-solana'), 'mainnet')
  const gw = moves.filter(m => m.bridge === 'gateway')
  assert.equal(gw.length, 1, 'gateway-attest-solana: one gateway move')
  assert.equal(gw[0].direction, 'in')
  assert.equal(gw[0].chainId, NON_EVM.solana)  // -5
  close(gw[0].usdc, 7.730, 1e-3)
}

// ── 5. across-deposit-ethereum → out, 1, 94.709227; same tx has LI.FI → one move, bridge='across', via='LI.FI' ──

{
  const raw = fixture('across-deposit-ethereum')
  const moves = decodeBridgeLogs(raw, 'mainnet')
  // There must be exactly ONE deduplicated move (across absorbs lifi)
  assert.equal(moves.length, 1, 'across-deposit-ethereum: exactly one move after dedupe')
  assert.equal(moves[0].bridge, 'across')
  assert.equal(moves[0].direction, 'out')
  assert.equal(moves[0].chainId, 1)
  close(moves[0].usdc, 94.709227)
  assert.equal(moves[0].via, 'LI.FI', 'via=LI.FI absorbed from lifi move')
}

// ── 6. across-deposit-base → out, 8453, 65.65 ───────────────────────────────

{
  const moves = decodeBridgeLogs(fixture('across-deposit-base'), 'mainnet')
  const ac = moves.filter(m => m.bridge === 'across')
  assert.equal(ac.length, 1, 'across-deposit-base: one across move')
  assert.equal(ac[0].direction, 'out')
  assert.equal(ac[0].chainId, 8453)
  close(ac[0].usdc, 65.65)
}

// ── 7. across-fill-arbitrum → in, 42161, 100.085817 ─────────────────────────

{
  const moves = decodeBridgeLogs(fixture('across-fill-arbitrum'), 'mainnet')
  const ac = moves.filter(m => m.bridge === 'across')
  assert.equal(ac.length, 1, 'across-fill-arbitrum: one across move')
  assert.equal(ac[0].direction, 'in')
  assert.equal(ac[0].chainId, 42161)
  close(ac[0].usdc, 100.085817)
}

// ── 8. across-fill-robinhood → in, 4663, 18.337387 ──────────────────────────

{
  const moves = decodeBridgeLogs(fixture('across-fill-robinhood'), 'mainnet')
  const ac = moves.filter(m => m.bridge === 'across')
  assert.equal(ac.length, 1, 'across-fill-robinhood: one across move')
  assert.equal(ac[0].direction, 'in')
  assert.equal(ac[0].chainId, 4663)
  close(ac[0].usdc, 18.337387)
}

// ── 9. hyperlane-out-base-1 → out, 8453, 6309.677936 ────────────────────────

{
  const moves = decodeBridgeLogs(fixture('hyperlane-out-base-1'), 'mainnet')
  const hl = moves.filter(m => m.bridge === 'hyperlane')
  assert.equal(hl.length, 1, 'hyperlane-out-base-1: one hyperlane move')
  assert.equal(hl[0].direction, 'out')
  assert.equal(hl[0].chainId, 8453)
  close(hl[0].usdc, 6309.677936)
}

// ── 10. hyperlane-in-base-1 → in, 8453, 16.405605 ───────────────────────────

{
  const moves = decodeBridgeLogs(fixture('hyperlane-in-base-1'), 'mainnet')
  const hl = moves.filter(m => m.bridge === 'hyperlane')
  assert.equal(hl.length, 1, 'hyperlane-in-base-1: one hyperlane move')
  assert.equal(hl[0].direction, 'in')
  assert.equal(hl[0].chainId, 8453)
  close(hl[0].usdc, 16.405605)
}

// ── 11. lifi-intents-bnb → out, 56, 22.579415, via 'lifiIntents' ─────────────

{
  const moves = decodeBridgeLogs(fixture('lifi-intents-bnb'), 'mainnet')
  const lifi = moves.filter(m => m.bridge === 'lifi')
  assert.equal(lifi.length, 1, 'lifi-intents-bnb: one lifi move')
  assert.equal(lifi[0].direction, 'out')
  assert.equal(lifi[0].chainId, 56)
  close(lifi[0].usdc, 22.579415)
  assert.equal(lifi[0].via, 'lifiIntents', 'via=lifiIntents from bridge field')
}

// ── 12. debridge-fulfilled-ethereum → in, chain 1, usdc null ────────────────

{
  const moves = decodeBridgeLogs(fixture('debridge-fulfilled-ethereum'), 'mainnet')
  const db = moves.filter(m => m.bridge === 'debridge')
  assert.equal(db.length, 1, 'debridge-fulfilled-ethereum: one debridge move')
  assert.equal(db[0].direction, 'in')
  assert.equal(db[0].chainId, 1)
  // takeToken on Arc is 0xa3de1dda... (not ARC_USDC, not native): usdc null per rules
  assert.equal(db[0].usdc, null, 'debridge-fulfilled-ethereum: unknown take token → usdc null')
}

// ── 13. debridge-created-robinhood → out, 4663, 267.8928 ────────────────────

{
  const moves = decodeBridgeLogs(fixture('debridge-created-robinhood'), 'mainnet')
  const db = moves.filter(m => m.bridge === 'debridge')
  assert.equal(db.length, 1, 'debridge-created-robinhood: one debridge move')
  assert.equal(db[0].direction, 'out')
  assert.equal(db[0].chainId, 4663)
  close(db[0].usdc, 267.8928, 1e-3)
}

// ── 14. Edge cases ─────────────────────────────────────────────────────────────

// Unknown chain id stays as is (e.g. very large chain id)
{
  const fakeLog: BridgeLogLike = {
    address: '0x56a255a080584de4433d0fe6587f4c0105715589',
    topics: [
      '0xd229aacb94204188fe8042965fa6b269c62dc5818b21238779ab64bdd17efeec',
      '0x' + (999999n).toString(16).padStart(64, '0'),
      '0x' + '1'.padStart(64, '0'),
    ],
    data: '0x' + (1000000n).toString(16).padStart(64, '0'),
    transactionHash: '0x' + 'aa'.repeat(32),
  }
  const moves = decodeBridgeLogs([fakeLog], 'mainnet')
  const hl = moves.filter(m => m.bridge === 'hyperlane')
  assert.equal(hl.length, 1)
  assert.equal(hl[0].chainId, 999999, 'unknown chain id stays as-is')
}

// Malformed / short data → skipped
{
  const badLog: BridgeLogLike = {
    address: '0x9b4a302a548c7e313c2b74c461db7b84d3074a84',
    topics: [
      '0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3',
      '0x' + '1'.padStart(64, '0'),
      '0x' + '1'.padStart(64, '0'),
      '0x' + '1'.padStart(64, '0'),
    ],
    data: '0x' + '00'.repeat(2 * 32),  // only 2 words, need 4
    transactionHash: '0x' + 'bb'.repeat(32),
  }
  const moves = decodeBridgeLogs([badLog], 'mainnet')
  const ac = moves.filter(m => m.bridge === 'across')
  assert.equal(ac.length, 0, 'short data → skipped for across')
}

// Testnet returns [] for non-CCTP bridges
{
  const moves = decodeBridgeLogs(fixture('gateway-burn-arbitrum'), 'testnet')
  const gw = moves.filter(m => m.bridge === 'gateway')
  assert.equal(gw.length, 0, 'testnet: gateway moves ignored')
}

// ── 15. dedupeMoves priority ──────────────────────────────────────────────────

{
  const tx = '0x' + 'cc'.repeat(32)
  const moves = dedupeMoves([
    { txHash: tx, bridge: 'across', direction: 'out', chainId: 1, usdc: 100 },
    { txHash: tx, bridge: 'lifi', direction: 'out', chainId: 1, usdc: 100, via: 'across' },
  ])
  assert.equal(moves.length, 1, 'dedupe: one move from across+lifi')
  assert.equal(moves[0].bridge, 'across', 'across wins over lifi')
  assert.equal(moves[0].via, 'LI.FI', 'via set to LI.FI')
}

{
  const tx = '0x' + 'dd'.repeat(32)
  const moves = dedupeMoves([
    { txHash: tx, bridge: 'cctp', direction: 'out', chainId: 6, usdc: 50 },
    { txHash: tx, bridge: 'gateway', direction: 'out', chainId: 6, usdc: 50 },
  ])
  assert.equal(moves.length, 1)
  assert.equal(moves[0].bridge, 'cctp', 'cctp wins over gateway')
}

// ── 16. BRIDGE_TOPICS has no duplicates and BRIDGE_ADDRESSES are lower-case 0x+40 hex ──

assert.equal(new Set(BRIDGE_TOPICS).size, BRIDGE_TOPICS.length, 'no duplicate topics')
assert.ok(BRIDGE_TOPICS.every(t => /^0x[0-9a-f]{64}$/.test(t)), 'all topics are 0x+64 hex lowercase')
assert.ok(BRIDGE_ADDRESSES.every(a => /^0x[0-9a-f]{40}$/.test(a)), 'all addresses are 0x+40 hex lowercase')
assert.equal(new Set(BRIDGE_ADDRESSES).size, BRIDGE_ADDRESSES.length, 'no duplicate addresses')

// ── 17. summarise ─────────────────────────────────────────────────────────────

{
  const tx1 = '0x' + '11'.repeat(32)
  const tx2 = '0x' + '22'.repeat(32)
  const tx3 = '0x' + '33'.repeat(32)

  const moves = [
    { txHash: tx1, bridge: 'cctp' as const, direction: 'in' as const, chainId: 6, usdc: 100 },
    { txHash: tx2, bridge: 'across' as const, direction: 'out' as const, chainId: 8453, usdc: 50 },
    { txHash: tx3, bridge: 'gateway' as const, direction: 'in' as const, chainId: null, usdc: null },
  ]
  const s = summarise(moves)
  assert.equal(s.byBridge.cctp.in.count, 1)
  assert.equal(s.byBridge.cctp.in.usdc, 100)
  assert.equal(s.byBridge.across.out.count, 1)
  assert.equal(s.byBridge.across.out.usdc, 50)
  assert.equal(s.byBridge.gateway.in.count, 1)
  assert.equal(s.byBridge.gateway.usdcUnknownCount, 1)
  assert.equal(s.byChain[6].in.count, 1)
  assert.equal(s.byChain[8453].out.count, 1)
  // chainId null → not in byChain
  assert.equal(s.byChain[null as unknown as number], undefined, 'null chainId not in byChain')
}

console.log('bridgeLive.test.ts: all assertions passed')
