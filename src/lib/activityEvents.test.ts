// run: node --experimental-strip-types --no-warnings src/lib/activityEvents.test.ts
import assert from 'node:assert/strict'
import { transferToEvent, txToEvent } from './activityEvents.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let pass = 0
let total = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  ✓  ${label}`)
    pass++
  } catch (err) {
    const e = err as assert.AssertionError
    console.error(`  ✗  ${label}`)
    console.error(`       actual  : ${JSON.stringify(e.actual)}`)
    console.error(`       expected: ${JSON.stringify(e.expected)}`)
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ANCHOR_ADDR  = '0xAaBbCcDdEeFf000000000000000000000000aaaa'
const ANCHOR_LOWER = '0xaabbccddeeff000000000000000000000000aaaa'
const ZERO_ADDR    = '0x0000000000000000000000000000000000000000'
const FROM_ADDR    = '0x1111111111111111111111111111111111111111'
const TO_ADDR      = '0x2222222222222222222222222222222222222222'

// A fixed ISO timestamp with a known epoch:
//   new Date('2024-03-15T12:00:00.000Z').getTime() === 1710504000000
const ISO_TS  = '2024-03-15T12:00:00.000Z'
const EPOCH   = 1710504000000

// ---------------------------------------------------------------------------
// transferToEvent
// ---------------------------------------------------------------------------
console.log('\ntransferToEvent')

// ── ts ──────────────────────────────────────────────────────────────────────
check(
  'ts is Date(timestamp).getTime() for known ISO string',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash1',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
  }).ts,
  EPOCH,
)

// ── wallets lowercasing ──────────────────────────────────────────────────────
check(
  'wallets are lower-cased from and to',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    to:   { hash: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
  }).wallets,
  [
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ],
)

// ── zero address is dropped ──────────────────────────────────────────────────
check(
  'zero address in from is dropped',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: ZERO_ADDR },
    to:   { hash: TO_ADDR },
  }).wallets,
  [TO_ADDR],
)

check(
  'zero address in to is dropped',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: ZERO_ADDR },
  }).wallets,
  [FROM_ADDR],
)

check(
  'both zero addresses -> []',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: ZERO_ADDR },
    to:   { hash: ZERO_ADDR },
  }).wallets,
  [],
)

// ── anchor address is dropped (case-insensitive) ─────────────────────────────
check(
  'from equal to anchor address (upper-case anchor) is dropped',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: ANCHOR_LOWER },
    to:   { hash: TO_ADDR },
  }).wallets,
  [TO_ADDR],
)

check(
  'to equal to anchor address (lower-case input) is dropped',
  transferToEvent({ address: ANCHOR_LOWER, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: ANCHOR_ADDR },
  }).wallets,
  [FROM_ADDR],
)

check(
  'both from and to equal anchor -> []',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: ANCHOR_LOWER },
    to:   { hash: ANCHOR_ADDR },
  }).wallets,
  [],
)

// ── same wallet as from AND to -> kept TWICE (current behaviour) ─────────────
check(
  'same non-anchor address as from and to -> appears twice',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: FROM_ADDR },
  }).wallets,
  [FROM_ADDR, FROM_ADDR],
)

// ── missing from/to hash -> uses optional chaining -> live(undefined) = '' -> filtered ──
// The code does: live(t.from?.hash) and live(t.to?.hash).
// live(undefined) returns '' which is falsy, so it is filtered out.
check(
  'missing from.hash -> empty string -> filtered out',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: {} as { hash: string },   // hash property absent
    to:   { hash: TO_ADDR },
  }).wallets,
  [TO_ADDR],
)

check(
  'missing to.hash -> filtered out',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   {} as { hash: string },
  }).wallets,
  [FROM_ADDR],
)

// ── usd: anchor.usd falsy (undefined) -> null ────────────────────────────────
check(
  'usd is null when anchor.usd is undefined',
  transferToEvent({ address: ANCHOR_ADDR } as { address: string; usd: undefined }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
    total: { value: '1500000', decimals: '6' },
  }).usd,
  null,
)

check(
  'usd is null when anchor.usd is false',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
    total: { value: '1500000', decimals: '6' },
  }).usd,
  null,
)

// ── usd = scaled(value, decimals) when anchor.usd true ───────────────────────
// scaled('1500000', '6'): d=6, s='1500000', whole='1', frac='500000' -> 1.5
check(
  'usd = scaled(value, decimals): 1500000 / 10^6 = 1.5',
  transferToEvent({ address: ANCHOR_ADDR, usd: true }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
    total: { value: '1500000', decimals: '6' },
  }).usd,
  1.5,
)

// ── decimals null -> defaults to 18 ──────────────────────────────────────────
// scaled('1000000000000000000', null ?? 18): d=18 -> 1.0
check(
  'decimals null -> defaults to 18: 1e18 / 10^18 = 1',
  transferToEvent({ address: ANCHOR_ADDR, usd: true }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
    total: { value: '1000000000000000000', decimals: null },
  }).usd,
  1,
)

// ── decimals undefined -> defaults to 18 ─────────────────────────────────────
check(
  'decimals undefined -> defaults to 18: 1e18 / 10^18 = 1',
  transferToEvent({ address: ANCHOR_ADDR, usd: true }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
    total: { value: '1000000000000000000' },
  }).usd,
  1,
)

// ── missing total -> 0 (not null) when anchor.usd true ───────────────────────
// scaled(undefined, 18) returns 0 because !raw is true.
check(
  'missing total -> usd is 0 when anchor.usd true',
  transferToEvent({ address: ANCHOR_ADDR, usd: true }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
  }).usd,
  0,
)

// ── fee is always 0 ──────────────────────────────────────────────────────────
check(
  'fee is always 0',
  transferToEvent({ address: ANCHOR_ADDR, usd: true }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xhash',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
    total: { value: '1000000', decimals: '6' },
  }).fee,
  0,
)

// ── hash is transaction_hash ─────────────────────────────────────────────────
check(
  'hash is transaction_hash',
  transferToEvent({ address: ANCHOR_ADDR, usd: false }, {
    timestamp:        ISO_TS,
    transaction_hash: '0xdeadbeef',
    from: { hash: FROM_ADDR },
    to:   { hash: TO_ADDR },
  }).hash,
  '0xdeadbeef',
)

// ---------------------------------------------------------------------------
// txToEvent
// ---------------------------------------------------------------------------
console.log('\ntxToEvent')

// ── ts ──────────────────────────────────────────────────────────────────────
check(
  'ts is Date(timestamp).getTime()',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '0',
  }).ts,
  EPOCH,
)

// ── wallets: only sender lower-cased ─────────────────────────────────────────
check(
  'wallets contains only sender lower-cased',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' },
    value:     '0',
  }).wallets,
  ['0xcccccccccccccccccccccccccccccccccccccccc'],
)

// ── sender equal to anchor address -> [] ────────────────────────────────────
check(
  'sender equal to anchor (mixed case) -> []',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: ANCHOR_LOWER },
    value:     '0',
  }).wallets,
  [],
)

check(
  'sender equal to anchor (same case) -> []',
  txToEvent({ address: ANCHOR_LOWER }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: ANCHOR_LOWER },
    value:     '0',
  }).wallets,
  [],
)

// ── empty sender hash -> filtered out -> [] ──────────────────────────────────
// live('') = '' -> falsy -> filtered
check(
  'empty from.hash -> []',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: '' },
    value:     '0',
  }).wallets,
  [],
)

// ── usd null when value '0' ───────────────────────────────────────────────────
// scaled('0', 18) = 0; native > 0 is false -> usd = null
check(
  "usd is null when value is '0'",
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '0',
  }).usd,
  null,
)

// ── usd = value / 1e18 when value > 0 ────────────────────────────────────────
// scaled('2500000000000000000', 18):
//   d=18, s='2500000000000000000', whole='2', frac='500000000000000000' -> 2.5
check(
  "usd = 2.5 when value is '2500000000000000000'",
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '2500000000000000000',
  }).usd,
  2.5,
)

// ── fee = scaled(fee.value, 18) ───────────────────────────────────────────────
// scaled('1000000000000000000', 18) = 1
check(
  "fee = 1 when fee.value is '1000000000000000000'",
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '0',
    fee:       { value: '1000000000000000000' },
  }).fee,
  1,
)

// scaled('500000000000000000', 18) = 0.5
check(
  "fee = 0.5 when fee.value is '500000000000000000'",
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '0',
    fee:       { value: '500000000000000000' },
  }).fee,
  0.5,
)

// ── fee = 0 when fee is missing ───────────────────────────────────────────────
// scaled(undefined, 18) = 0
check(
  'fee is 0 when fee field is absent',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '0',
  }).fee,
  0,
)

// ── fee = 0 when fee is null ──────────────────────────────────────────────────
check(
  'fee is 0 when fee is null',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '0',
    fee:       null,
  }).fee,
  0,
)

// ── fee = 0 when fee.value is missing ────────────────────────────────────────
check(
  'fee is 0 when fee.value is absent',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xhash',
    from:      { hash: FROM_ADDR },
    value:     '0',
    fee:       {},
  }).fee,
  0,
)

// ── hash is `hash` ────────────────────────────────────────────────────────────
check(
  'hash field equals t.hash',
  txToEvent({ address: ANCHOR_ADDR }, {
    timestamp: ISO_TS,
    hash:      '0xcafebabe',
    from:      { hash: FROM_ADDR },
    value:     '0',
  }).hash,
  '0xcafebabe',
)

// ---------------------------------------------------------------------------
// Records with a missing party (ArcScan can omit it) must not throw
// ---------------------------------------------------------------------------
console.log('\n--- missing parties ---')
{
  const anchor = { address: '0xAnchor', usd: false }
  const noFrom = { timestamp: '2026-01-01T00:00:00Z', transaction_hash: '0xh', to: { hash: '0xBeef' } } as never
  check('transfer without from keeps the to wallet', transferToEvent(anchor, noFrom).wallets, ['0xbeef'])
  const noTo = { timestamp: '2026-01-01T00:00:00Z', transaction_hash: '0xh', from: { hash: '0xBeef' } } as never
  check('transfer without to keeps the from wallet', transferToEvent(anchor, noTo).wallets, ['0xbeef'])
  const noSender = { timestamp: '2026-01-01T00:00:00Z', hash: '0xh', value: '0' } as never
  check('tx without sender gives no wallets', txToEvent(anchor, noSender).wallets, [])
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${pass}/${total} passed`)
if (pass < total) {
  process.exit(1)
}
