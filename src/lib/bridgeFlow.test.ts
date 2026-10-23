/**
 * Unit tests for bridgeFlow.ts (domainName + summarizeBridgeLogs).
 *
 * Run from the repo root:
 *   node --experimental-strip-types --no-warnings src/lib/bridgeFlow.test.ts
 *
 * Uses only node:assert (strict). No test runner required.
 * All expected values are derived by hand from the source; quirks are pinned and named.
 */

import assert from 'node:assert/strict'
import { domainName, summarizeBridgeLogs, USDC, CCTP_DOMAINS } from './bridgeFlow.ts'
import type { LogItem, BridgeFlow, Param } from './bridgeFlow.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EPS = 1e-9

function near(a: number, b: number, label: string): void {
  assert(
    Math.abs(a - b) < EPS,
    `${label}: expected ${b}, got ${a} (diff ${Math.abs(a - b)})`,
  )
}

/** Build a minimal DepositForBurn LogItem. */
function deposit(opts: {
  block: number
  amount: string
  burnToken?: string
  destinationDomain?: number
}): LogItem {
  return {
    block_number: opts.block,
    decoded: {
      method_call: 'DepositForBurn(uint256 amount, uint64 destinationDomain, bytes32 mintRecipient, address burnToken)',
      parameters: [
        { name: 'amount', value: opts.amount },
        { name: 'destinationDomain', value: String(opts.destinationDomain ?? 0) },
        { name: 'burnToken', value: opts.burnToken ?? USDC },
      ],
    },
  }
}

/** Build a minimal MintAndWithdraw LogItem. */
function mint(opts: {
  block: number
  amount: string
  feeCollected?: string
  mintToken?: string
}): LogItem {
  const parameters: Param[] = [
    { name: 'amount', value: opts.amount },
    { name: 'mintToken', value: opts.mintToken ?? USDC },
  ]
  if (opts.feeCollected !== undefined) {
    parameters.push({ name: 'feeCollected', value: opts.feeCollected })
  }
  return {
    block_number: opts.block,
    decoded: {
      method_call: 'MintAndWithdraw(address mintRecipient, uint256 amount, address mintToken, uint256 feeCollected)',
      parameters,
    },
  }
}

let passed = 0

function ok(label: string): void {
  passed++
  // Uncomment to get verbose output:
  // console.log(`  PASS  ${label}`)
}

// ---------------------------------------------------------------------------
// 1. domainName
// ---------------------------------------------------------------------------

console.log('domainName')

assert.strictEqual(domainName(0),  'Ethereum');      ok('domain 0  → Ethereum')
assert.strictEqual(domainName(1),  'Avalanche');     ok('domain 1  → Avalanche')
assert.strictEqual(domainName(2),  'OP Mainnet');    ok('domain 2  → OP Mainnet')
assert.strictEqual(domainName(3),  'Arbitrum');      ok('domain 3  → Arbitrum')
assert.strictEqual(domainName(5),  'Solana');        ok('domain 5  → Solana')
assert.strictEqual(domainName(6),  'Base');          ok('domain 6  → Base')
assert.strictEqual(domainName(7),  'Polygon PoS');   ok('domain 7  → Polygon PoS')
assert.strictEqual(domainName(10), 'Unichain');      ok('domain 10 → Unichain')
assert.strictEqual(domainName(11), 'Linea');         ok('domain 11 → Linea')
assert.strictEqual(domainName(12), 'Codex');         ok('domain 12 → Codex')
assert.strictEqual(domainName(13), 'Sonic');         ok('domain 13 → Sonic')
assert.strictEqual(domainName(14), 'World Chain');   ok('domain 14 → World Chain')

// Domain 4 = Noble (V1 only — included per task spec).
assert.strictEqual(domainName(4),  'Noble');         ok('domain 4  → Noble (V1 only)')

// Domain 18 = XDC (now in the table).
assert.strictEqual(domainName(18), 'XDC');           ok('domain 18 → XDC')

// New domains added in this iteration:
assert.strictEqual(domainName(15), 'Monad');         ok('domain 15 → Monad')
assert.strictEqual(domainName(19), 'HyperEVM');      ok('domain 19 → HyperEVM')
assert.strictEqual(domainName(26), 'Arc');           ok('domain 26 → Arc')
assert.strictEqual(domainName(37), 'X Layer');       ok('domain 37 → X Layer')

// -1 sentinel = unknown source (indexer uses this for arrivals with no source domain).
assert.strictEqual(domainName(-1), 'Unknown source'); ok('domain -1 → Unknown source')

// Truly unknown id → `Domain ${id}`.
assert.strictEqual(domainName(999), 'Domain 999');   ok('domain 999 → Domain 999 (unknown)')

// CCTP_DOMAINS export sanity: key -1 is present and resolves correctly.
assert.strictEqual(CCTP_DOMAINS[-1], 'Unknown source'); ok('CCTP_DOMAINS[-1] exported correctly')

// ---------------------------------------------------------------------------
// 2. summarizeBridgeLogs — empty list
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: empty list')

{
  const r: BridgeFlow = summarizeBridgeLogs([])
  assert.strictEqual(r.outCount,  0, 'empty: outCount')
  near(r.outUsdc,  0, 'empty: outUsdc')
  assert.strictEqual(r.inCount,   0, 'empty: inCount')
  near(r.inUsdc,   0, 'empty: inUsdc')
  near(r.feesUsdc, 0, 'empty: feesUsdc')
  assert.deepStrictEqual(r.byDestination, [], 'empty: byDestination')
  assert.strictEqual(r.blockSpan, 0, 'empty: blockSpan')
  ok('empty list → all zeros')
}

// ---------------------------------------------------------------------------
// 3. DepositForBurn — basic outgoing
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: DepositForBurn basic')

{
  // "1000000" raw → scaled("1000000", 6):
  //   padStart(7, '0') → "1000000" (already 7 chars)
  //   whole = s.slice(0, 1) = "1", frac = s.slice(1) = "000000"
  //   Number("1.000000") = 1.0
  const r = summarizeBridgeLogs([deposit({ block: 100, amount: '1000000', destinationDomain: 0 })])
  assert.strictEqual(r.outCount, 1,  'basic deposit: outCount')
  near(r.outUsdc, 1.0,              'basic deposit: outUsdc')
  assert.strictEqual(r.inCount, 0,  'basic deposit: inCount')
  near(r.inUsdc, 0,                 'basic deposit: inUsdc')
  near(r.feesUsdc, 0,               'basic deposit: feesUsdc')
  assert.strictEqual(r.byDestination.length, 1, 'basic deposit: byDestination length')
  assert.strictEqual(r.byDestination[0].domain, 0,          'basic deposit: domain id')
  assert.strictEqual(r.byDestination[0].name, 'Ethereum',   'basic deposit: domain name')
  near(r.byDestination[0].usdc, 1.0,                        'basic deposit: domain usdc')
  assert.strictEqual(r.byDestination[0].count, 1,           'basic deposit: domain count')
  assert.strictEqual(r.blockSpan, 0, 'basic deposit: blockSpan single item = 0')
  ok('DepositForBurn basic')
}

// ---------------------------------------------------------------------------
// 4. burnToken case-insensitivity
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: burnToken case variants')

{
  // The code does: String(p.burnToken).toLowerCase() === USDC
  // USDC constant is already all-lowercase, so any case variant of it matches.
  const upper = USDC.toUpperCase()     // '0X3600...' with uppercase hex
  const mixed = USDC.slice(0, 3) + USDC.slice(3).toUpperCase()  // '0x3' + upper rest

  const rUpper = summarizeBridgeLogs([deposit({ block: 1, amount: '2000000', destinationDomain: 6, burnToken: upper })])
  assert.strictEqual(rUpper.outCount, 1, 'upper burnToken: outCount')
  near(rUpper.outUsdc, 2.0,             'upper burnToken: outUsdc')
  ok('burnToken uppercase still matches')

  const rMixed = summarizeBridgeLogs([deposit({ block: 1, amount: '2000000', destinationDomain: 6, burnToken: mixed })])
  assert.strictEqual(rMixed.outCount, 1, 'mixed burnToken: outCount')
  near(rMixed.outUsdc, 2.0,             'mixed burnToken: outUsdc')
  ok('burnToken mixed case still matches')
}

// ---------------------------------------------------------------------------
// 5. DepositForBurn with a different token — ignored
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: DepositForBurn foreign token')

{
  const foreignToken = '0x' + 'aa'.repeat(20)   // not USDC
  const r = summarizeBridgeLogs([
    deposit({ block: 50, amount: '5000000', destinationDomain: 3, burnToken: foreignToken }),
  ])
  assert.strictEqual(r.outCount, 0, 'foreign burnToken: outCount = 0')
  near(r.outUsdc, 0,                'foreign burnToken: outUsdc = 0')
  assert.deepStrictEqual(r.byDestination, [], 'foreign burnToken: byDestination empty')
  // blockSpan still uses block_number of the ignored item
  assert.strictEqual(r.blockSpan, 0, 'foreign burnToken: blockSpan from ignored item (single block → 0)')
  ok('DepositForBurn foreign token ignored')
}

// ---------------------------------------------------------------------------
// 6. MintAndWithdraw — basic incoming + fee
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: MintAndWithdraw basic')

{
  // amount = "800000" → 0.8; feeCollected = "100000" → 0.1
  const r = summarizeBridgeLogs([mint({ block: 200, amount: '800000', feeCollected: '100000' })])
  assert.strictEqual(r.inCount, 1, 'mint basic: inCount')
  near(r.inUsdc, 0.8,              'mint basic: inUsdc')
  near(r.feesUsdc, 0.1,            'mint basic: feesUsdc')
  assert.strictEqual(r.outCount, 0,'mint basic: outCount = 0')
  near(r.outUsdc, 0,               'mint basic: outUsdc = 0')
  assert.deepStrictEqual(r.byDestination, [], 'mint basic: byDestination empty (no deposits)')
  assert.strictEqual(r.blockSpan, 0, 'mint basic: single item blockSpan = 0')
  ok('MintAndWithdraw basic incoming + fee')
}

// ---------------------------------------------------------------------------
// 7. MintAndWithdraw — missing feeCollected parameter
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: MintAndWithdraw no feeCollected param')

{
  // When feeCollected is absent from parameters, p.feeCollected is undefined.
  // scaled(undefined, 6): !raw is true for undefined → returns 0.
  const r = summarizeBridgeLogs([mint({ block: 300, amount: '500000' })])
  assert.strictEqual(r.inCount, 1, 'no fee param: inCount')
  near(r.inUsdc, 0.5,              'no fee param: inUsdc')
  near(r.feesUsdc, 0,              'no fee param: feesUsdc = 0 when param missing')
  ok('MintAndWithdraw missing feeCollected → feesUsdc 0')
}

// ---------------------------------------------------------------------------
// 8. MintAndWithdraw with a different mintToken — ignored
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: MintAndWithdraw foreign mintToken')

{
  const foreignToken = '0x' + 'bb'.repeat(20)
  const r = summarizeBridgeLogs([
    mint({ block: 400, amount: '999999', mintToken: foreignToken }),
  ])
  assert.strictEqual(r.inCount, 0, 'foreign mintToken: inCount = 0')
  near(r.inUsdc, 0,                'foreign mintToken: inUsdc = 0')
  near(r.feesUsdc, 0,              'foreign mintToken: feesUsdc = 0')
  ok('MintAndWithdraw foreign mintToken ignored')
}

// ---------------------------------------------------------------------------
// 9. Unknown method name — ignored
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: unknown method name')

{
  const item: LogItem = {
    block_number: 500,
    decoded: {
      method_call: 'Transfer(address from, address to, uint256 value)',
      parameters: [
        { name: 'from',  value: '0x' + '0'.repeat(40) },
        { name: 'to',    value: '0x' + '1'.repeat(40) },
        { name: 'value', value: '1000000' },
      ],
    },
  }
  const r = summarizeBridgeLogs([item])
  assert.strictEqual(r.outCount, 0, 'unknown method: outCount')
  assert.strictEqual(r.inCount,  0, 'unknown method: inCount')
  near(r.feesUsdc, 0,               'unknown method: feesUsdc')
  ok('unknown method name ignored without throwing')
}

// ---------------------------------------------------------------------------
// 10. Robustness: decoded null / missing decoded / missing parameters
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: malformed items')

{
  const nullDecoded: LogItem  = { block_number: 600, decoded: null }
  const noDecoded: LogItem    = { block_number: 601 }
  const noParams: LogItem     = { block_number: 602, decoded: { method_call: 'DepositForBurn' } }
  const noMethodCall: LogItem = { block_number: 603, decoded: { parameters: [{ name: 'x', value: 'y' }] } }

  const items: LogItem[] = [nullDecoded, noDecoded, noParams, noMethodCall]

  // Should not throw; all items are ignored.
  let r: BridgeFlow
  assert.doesNotThrow(() => { r = summarizeBridgeLogs(items) }, 'malformed items: must not throw')
  r = summarizeBridgeLogs(items)
  assert.strictEqual(r.outCount, 0, 'malformed: outCount')
  assert.strictEqual(r.inCount,  0, 'malformed: inCount')
  near(r.feesUsdc, 0,               'malformed: feesUsdc')
  assert.deepStrictEqual(r.byDestination, [], 'malformed: byDestination')

  // blockSpan uses ALL items including ignored ones.
  // blocks = [600, 601, 602, 603] → max 603 − min 600 = 3
  assert.strictEqual(r.blockSpan, 3, 'malformed: blockSpan uses all block_numbers including ignored items')

  ok('decoded null / missing decoded / missing parameters → ignored, no throw')
}

// ---------------------------------------------------------------------------
// 11. method_call without parenthesis part
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: method_call without parentheses')

{
  // split('(')[0] of 'DepositForBurn' (no parens) is 'DepositForBurn' → branch fires.
  const itemNoParens: LogItem = {
    block_number: 700,
    decoded: {
      method_call: 'DepositForBurn',   // no "(…)" suffix
      parameters: [
        { name: 'amount',            value: '3000000' },
        { name: 'destinationDomain', value: '6' },
        { name: 'burnToken',         value: USDC },
      ],
    },
  }
  const r = summarizeBridgeLogs([itemNoParens])
  assert.strictEqual(r.outCount, 1, 'no-parens method_call: outCount')
  near(r.outUsdc, 3.0,              'no-parens method_call: outUsdc')
  assert.strictEqual(r.byDestination[0].domain, 6, 'no-parens method_call: destinationDomain')
  ok('method_call without parentheses still matched')
}

// ---------------------------------------------------------------------------
// 12. Fees only counted for incoming (MintAndWithdraw), never for outgoing
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: fees not collected on outgoing')

{
  // A deposit list should produce feesUsdc = 0 even with many items.
  const r = summarizeBridgeLogs([
    deposit({ block: 1, amount: '1000000', destinationDomain: 0 }),
    deposit({ block: 2, amount: '2000000', destinationDomain: 6 }),
  ])
  near(r.feesUsdc, 0, 'outgoing only: feesUsdc = 0')
  ok('fees only counted for incoming, never outgoing')
}

// ---------------------------------------------------------------------------
// 13. Two deposits to the same domain are merged
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: same-domain deposits merged')

{
  // Both go to domain 3 (Arbitrum).
  // 1000000 → 1.0, 1500000 → 1.5  →  total 2.5
  const r = summarizeBridgeLogs([
    deposit({ block: 10, amount: '1000000', destinationDomain: 3 }),
    deposit({ block: 20, amount: '1500000', destinationDomain: 3 }),
  ])
  assert.strictEqual(r.outCount, 2,         'merged: outCount')
  near(r.outUsdc, 2.5,                      'merged: outUsdc')
  assert.strictEqual(r.byDestination.length, 1, 'merged: one row in byDestination')
  assert.strictEqual(r.byDestination[0].domain, 3, 'merged: domain id 3')
  assert.strictEqual(r.byDestination[0].name, 'Arbitrum', 'merged: domain name')
  near(r.byDestination[0].usdc, 2.5,        'merged: aggregated usdc')
  assert.strictEqual(r.byDestination[0].count, 2, 'merged: count 2')
  ok('two deposits same domain merged')
}

// ---------------------------------------------------------------------------
// 14. byDestination sorted descending by usdc
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: byDestination sorted descending by usdc')

{
  // domain 0: 0.5 USDC
  // domain 6: 3.0 USDC
  // domain 3: 1.5 USDC
  // Expected order: domain 6 (3.0) > domain 3 (1.5) > domain 0 (0.5)
  const r = summarizeBridgeLogs([
    deposit({ block: 1, amount: '500000',  destinationDomain: 0 }),   // 0.5
    deposit({ block: 2, amount: '3000000', destinationDomain: 6 }),   // 3.0
    deposit({ block: 3, amount: '1500000', destinationDomain: 3 }),   // 1.5
  ])
  assert.strictEqual(r.byDestination.length, 3, 'sort: 3 rows')
  assert.strictEqual(r.byDestination[0].domain, 6, 'sort: 1st is domain 6 (Base)')
  assert.strictEqual(r.byDestination[1].domain, 3, 'sort: 2nd is domain 3 (Arbitrum)')
  assert.strictEqual(r.byDestination[2].domain, 0, 'sort: 3rd is domain 0 (Ethereum)')
  near(r.byDestination[0].usdc, 3.0, 'sort: 1st usdc 3.0')
  near(r.byDestination[1].usdc, 1.5, 'sort: 2nd usdc 1.5')
  near(r.byDestination[2].usdc, 0.5, 'sort: 3rd usdc 0.5')
  assert.strictEqual(r.byDestination[0].name, 'Base',     'sort: 1st name')
  assert.strictEqual(r.byDestination[1].name, 'Arbitrum', 'sort: 2nd name')
  assert.strictEqual(r.byDestination[2].name, 'Ethereum', 'sort: 3rd name')
  ok('byDestination sorted descending by usdc')
}

// ---------------------------------------------------------------------------
// 15. blockSpan across ALL items including ignored ones
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: blockSpan uses all items')

{
  // One valid deposit (block 100) + one ignored item (block 200, null decoded).
  // blockSpan = 200 − 100 = 100.
  const items: LogItem[] = [
    deposit({ block: 100, amount: '1000000', destinationDomain: 0 }),
    { block_number: 200, decoded: null },
  ]
  const r = summarizeBridgeLogs(items)
  assert.strictEqual(r.blockSpan, 100, 'blockSpan: uses ignored item block_number')
  ok('blockSpan computed across all items including ignored')
}

// ---------------------------------------------------------------------------
// 16. Input list not mutated
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: input not mutated')

{
  const items: LogItem[] = [
    deposit({ block: 1, amount: '1000000', destinationDomain: 0 }),
    deposit({ block: 2, amount: '2000000', destinationDomain: 6 }),
  ]
  const snapshot = JSON.stringify(items)
  summarizeBridgeLogs(items)
  assert.strictEqual(JSON.stringify(items), snapshot, 'input list not mutated')
  ok('input list not mutated')
}

// ---------------------------------------------------------------------------
// 17. byDestination rows each carry a name from domainName
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: byDestination name field')

{
  // Domain 99 is unknown → name should be 'Domain 99'.
  const r = summarizeBridgeLogs([
    deposit({ block: 1, amount: '1000000', destinationDomain: 99 }),
  ])
  assert.strictEqual(r.byDestination[0].name, 'Domain 99', 'unknown domain name in byDestination')
  ok('byDestination carries name from domainName (including unknown domain)')
}

// ---------------------------------------------------------------------------
// 18. Single item → blockSpan = 0
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: single item blockSpan = 0')

{
  const r = summarizeBridgeLogs([deposit({ block: 12345, amount: '1000000', destinationDomain: 0 })])
  assert.strictEqual(r.blockSpan, 0, 'single item: blockSpan = max − min = 12345 − 12345 = 0')
  ok('single item blockSpan = 0')
}

// ---------------------------------------------------------------------------
// 19. Realistic scenario
//     3 outgoing → Ethereum (domain 0): 1.0 + 2.5 + 0.5 = 4.0 USDC, count 3
//     1 outgoing → Base (domain 6):     3.0 USDC, count 1
//     2 incoming: 0.8 + 1.2 = 2.0 USDC, fees 0.1 + 0.05 = 0.15
//     1 foreign-token DepositForBurn: ignored
//     blocks: 100, 102, 104, 106, 108, 110, 112 → span = 112 − 100 = 12
// ---------------------------------------------------------------------------

console.log('summarizeBridgeLogs: realistic scenario')

{
  const foreignToken = '0x' + 'ff'.repeat(20)

  const items: LogItem[] = [
    // Outgoing → Ethereum
    deposit({ block: 100, amount: '1000000',  destinationDomain: 0 }),   // 1.0
    deposit({ block: 102, amount: '2500000',  destinationDomain: 0 }),   // 2.5
    deposit({ block: 104, amount: '500000',   destinationDomain: 0 }),   // 0.5
    // Outgoing → Base
    deposit({ block: 106, amount: '3000000',  destinationDomain: 6 }),   // 3.0
    // Incoming
    mint({ block: 108, amount: '800000',  feeCollected: '100000' }),     // 0.8, fee 0.1
    mint({ block: 110, amount: '1200000', feeCollected: '50000'  }),     // 1.2, fee 0.05
    // Foreign token — must be ignored
    deposit({ block: 112, amount: '9999999', destinationDomain: 5, burnToken: foreignToken }),
  ]

  const r = summarizeBridgeLogs(items)

  // Aggregate counts and amounts
  assert.strictEqual(r.outCount, 4, 'realistic: outCount')
  near(r.outUsdc, 7.0,              'realistic: outUsdc  (1.0 + 2.5 + 0.5 + 3.0)')
  assert.strictEqual(r.inCount, 2,  'realistic: inCount')
  near(r.inUsdc, 2.0,               'realistic: inUsdc   (0.8 + 1.2)')
  near(r.feesUsdc, 0.15,            'realistic: feesUsdc (0.1 + 0.05)')

  // byDestination: Ethereum (4.0, count 3) before Base (3.0, count 1)
  assert.strictEqual(r.byDestination.length, 2, 'realistic: byDestination length')

  const eth = r.byDestination[0]
  assert.strictEqual(eth.domain, 0,         'realistic: 1st domain id = 0')
  assert.strictEqual(eth.name, 'Ethereum',  'realistic: 1st domain name')
  near(eth.usdc, 4.0,                       'realistic: Ethereum usdc = 4.0')
  assert.strictEqual(eth.count, 3,          'realistic: Ethereum count = 3')

  const base = r.byDestination[1]
  assert.strictEqual(base.domain, 6,        'realistic: 2nd domain id = 6')
  assert.strictEqual(base.name, 'Base',     'realistic: 2nd domain name')
  near(base.usdc, 3.0,                      'realistic: Base usdc = 3.0')
  assert.strictEqual(base.count, 1,         'realistic: Base count = 1')

  // blockSpan: all 7 items (including foreign-token ignored item at block 112)
  // max 112 − min 100 = 12
  assert.strictEqual(r.blockSpan, 12, 'realistic: blockSpan = 112 − 100 = 12 (includes ignored item)')

  ok('realistic scenario: all fields correct')
}

// ---------------------------------------------------------------------------
// Added after mutation testing
// ---------------------------------------------------------------------------
{
  assert.equal(USDC, '0x3600000000000000000000000000000000000000') // Arc's USDC system address
  ok('USDC constant')

  const upper = '0x' + USDC.slice(2).toUpperCase()
  const r = summarizeBridgeLogs([mint({ block: 1, amount: '2000000', feeCollected: '1000', mintToken: upper })])
  assert.equal(r.inCount, 1)
  near(r.inUsdc, 2, 'mint with an upper-case token address still counts')
  near(r.feesUsdc, 0.001, 'its fee is counted')
  ok('mint token comparison is case-insensitive')
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log(`\nAll ${passed} assertions passed.`)
