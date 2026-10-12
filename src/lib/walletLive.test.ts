// Unit tests for walletLive.ts
// Run: node --experimental-strip-types --no-warnings src/lib/walletLive.test.ts

import assert from 'node:assert/strict'
import { toLiveFacts, formatLiveBalance, liveKind } from './walletLive.ts'
import type { LiveFacts } from './walletLive.ts'

// ---------------------------------------------------------------------------
// Minimal harness
// ---------------------------------------------------------------------------

let passed = 0
let total = 0

function check<T>(label: string, actual: T, expected: T): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  ✓ ${label}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${label}`)
    if (err instanceof assert.AssertionError) {
      const replacer = (_k: string, v: unknown): unknown => (typeof v === 'bigint' ? v.toString() + 'n' : v)
      console.error(`    actual:   ${JSON.stringify(actual, replacer)}`)
      console.error(`    expected: ${JSON.stringify(expected, replacer)}`)
    } else {
      console.error(err)
    }
  }
}

function checkNull(label: string, actual: LiveFacts | null): void {
  total++
  if (actual === null) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    expected null, got: ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
// toLiveFacts — balance forms
// ---------------------------------------------------------------------------

console.log('\ntoLiveFacts: balance as bigint')
{
  // zero balance
  const f = toLiveFacts({ balance: 0n, nonce: 0, code: '0x' })
  check('zero balance -> balanceUsdc 0', f?.balanceUsdc, 0)
  check('zero balance -> sentTxCount 0', f?.sentTxCount, 0)
  check('zero balance -> isContract false', f?.isContract, false)
}
{
  // 1 wei
  const f = toLiveFacts({ balance: 1n, nonce: 0, code: '0x' })
  // 1 wei = 0.000000000000000001 USDC — truncated to 6 fractional digits -> 0
  check('1 wei -> balanceUsdc 0 (below 6-decimal precision)', f?.balanceUsdc, 0)
}
{
  // 1e12 wei (1 micro-USDC after 6-decimal truncation)
  const f = toLiveFacts({ balance: 1_000_000_000_000n, nonce: 0, code: '0x' })
  check('1e12 wei -> balanceUsdc 0.000001', f?.balanceUsdc, 0.000001)
}
{
  // 1 USDC exactly (1e18 wei)
  const f = toLiveFacts({ balance: 1_000_000_000_000_000_000n, nonce: 0, code: '0x' })
  check('1e18 wei -> balanceUsdc 1', f?.balanceUsdc, 1)
}
{
  // 1.5 USDC (1.5 * 1e18 wei)
  const f = toLiveFacts({ balance: 1_500_000_000_000_000_000n, nonce: 0, code: '0x' })
  check('1.5e18 wei -> balanceUsdc 1.5', f?.balanceUsdc, 1.5)
}
{
  // 1234.567890 USDC
  const f = toLiveFacts({ balance: 1_234_567_890_000_000_000_000n, nonce: 0, code: '0x' })
  check('1234.567890 USDC: whole part', f?.balanceUsdc !== undefined ? Math.floor(f.balanceUsdc) : undefined, 1234)
}
{
  // Huge balance: 10**30 wei = 10**12 USDC
  const hugeWei = 10n ** 30n
  const f = toLiveFacts({ balance: hugeWei, nonce: 0, code: '0x' })
  check('10^30 wei -> non-null', f !== null, true)
  check('10^30 wei -> balanceUsdc is 1e12', f?.balanceUsdc, 1e12)
}

console.log('\ntoLiveFacts: balance as 0x-hex string')
{
  // '0x0' as balance
  const f = toLiveFacts({ balance: '0x0', nonce: 0, code: '0x' })
  check('balance 0x0 -> balanceUsdc 0', f?.balanceUsdc, 0)
}
{
  // 1e18 as hex
  const hex1Eth = '0x' + (1_000_000_000_000_000_000n).toString(16)
  const f = toLiveFacts({ balance: hex1Eth, nonce: 0, code: '0x' })
  check('balance 1e18 hex -> balanceUsdc 1', f?.balanceUsdc, 1)
}

// ---------------------------------------------------------------------------
// toLiveFacts — nonce forms
// ---------------------------------------------------------------------------

console.log('\ntoLiveFacts: nonce forms')
{
  // nonce as number
  const f = toLiveFacts({ balance: 0n, nonce: 42, code: '0x' })
  check('nonce number 42 -> sentTxCount 42', f?.sentTxCount, 42)
}
{
  // nonce as bigint
  const f = toLiveFacts({ balance: 0n, nonce: 7n, code: '0x' })
  check('nonce bigint 7n -> sentTxCount 7', f?.sentTxCount, 7)
}
{
  // nonce as 0x-hex string
  const f = toLiveFacts({ balance: 0n, nonce: '0x1a', code: '0x' })
  check('nonce 0x1a -> sentTxCount 26', f?.sentTxCount, 26)
}
{
  // nonce as 0x0
  const f = toLiveFacts({ balance: 0n, nonce: '0x0', code: '0x' })
  check('nonce 0x0 -> sentTxCount 0', f?.sentTxCount, 0)
}
{
  // nonce = Number.MAX_SAFE_INTEGER (edge: should succeed)
  const f = toLiveFacts({ balance: 0n, nonce: Number.MAX_SAFE_INTEGER, code: '0x' })
  check('nonce MAX_SAFE_INTEGER -> sentTxCount MAX_SAFE_INTEGER', f?.sentTxCount, Number.MAX_SAFE_INTEGER)
}
{
  // nonce as bigint exactly at MAX_SAFE_INTEGER -> ok
  const f = toLiveFacts({ balance: 0n, nonce: BigInt(Number.MAX_SAFE_INTEGER), code: '0x' })
  check('nonce bigint MAX_SAFE_INTEGER -> ok', f?.sentTxCount, Number.MAX_SAFE_INTEGER)
}

// ---------------------------------------------------------------------------
// toLiveFacts — code forms
// ---------------------------------------------------------------------------

console.log('\ntoLiveFacts: code forms -> isContract')
{
  check('code undefined -> isContract false', toLiveFacts({ balance: 0n, nonce: 0, code: undefined })?.isContract, false)
  check('code null -> isContract false',      toLiveFacts({ balance: 0n, nonce: 0, code: null })?.isContract,      false)
  check("code '' -> isContract false",        toLiveFacts({ balance: 0n, nonce: 0, code: '' })?.isContract,        false)
  check("code '0x' -> isContract false",      toLiveFacts({ balance: 0n, nonce: 0, code: '0x' })?.isContract,      false)
  check("code '0x0' -> isContract false",     toLiveFacts({ balance: 0n, nonce: 0, code: '0x0' })?.isContract,     false)
  check("code '0x60' -> isContract true",     toLiveFacts({ balance: 0n, nonce: 0, code: '0x60' })?.isContract,    true)
  check("code '0x6060' -> isContract true",   toLiveFacts({ balance: 0n, nonce: 0, code: '0x6060' })?.isContract,  true)
  // Long EVM runtime bytecode prefix
  const bytecode = '0x' + '60'.repeat(100)
  check('long bytecode -> isContract true', toLiveFacts({ balance: 0n, nonce: 0, code: bytecode })?.isContract, true)
}

// ---------------------------------------------------------------------------
// toLiveFacts — malformed inputs -> null
// ---------------------------------------------------------------------------

console.log('\ntoLiveFacts: malformed inputs -> null')
{
  // balance: wrong types
  checkNull('balance null -> null',         toLiveFacts({ balance: null,      nonce: 0, code: '0x' }))
  checkNull('balance undefined -> null',    toLiveFacts({ balance: undefined, nonce: 0, code: '0x' }))
  checkNull('balance number -> null',       toLiveFacts({ balance: 1,         nonce: 0, code: '0x' }))
  checkNull('balance string non-hex -> null', toLiveFacts({ balance: '100',   nonce: 0, code: '0x' }))
  checkNull('balance negative bigint -> null', toLiveFacts({ balance: -1n,    nonce: 0, code: '0x' }))
  checkNull('balance negative hex -> null', toLiveFacts({ balance: '-0x1',    nonce: 0, code: '0x' }))
  checkNull('balance object -> null',       toLiveFacts({ balance: {},        nonce: 0, code: '0x' }))
  checkNull('balance array -> null',        toLiveFacts({ balance: [],        nonce: 0, code: '0x' }))
  checkNull('balance NaN-string -> null',   toLiveFacts({ balance: 'abc',     nonce: 0, code: '0x' }))

  // nonce: wrong types
  checkNull('nonce null -> null',           toLiveFacts({ balance: 0n, nonce: null,       code: '0x' }))
  checkNull('nonce undefined -> null',      toLiveFacts({ balance: 0n, nonce: undefined,  code: '0x' }))
  checkNull('nonce string decimal -> null', toLiveFacts({ balance: 0n, nonce: '5',        code: '0x' }))
  checkNull('nonce negative number -> null', toLiveFacts({ balance: 0n, nonce: -1,        code: '0x' }))
  checkNull('nonce negative bigint -> null', toLiveFacts({ balance: 0n, nonce: -1n,       code: '0x' }))
  checkNull('nonce float -> null',          toLiveFacts({ balance: 0n, nonce: 1.5,        code: '0x' }))
  checkNull('nonce NaN -> null',            toLiveFacts({ balance: 0n, nonce: NaN,        code: '0x' }))
  checkNull('nonce Infinity -> null',       toLiveFacts({ balance: 0n, nonce: Infinity,   code: '0x' }))
  // nonce as bigint above MAX_SAFE_INTEGER
  checkNull('nonce bigint > MAX_SAFE_INTEGER -> null',
    toLiveFacts({ balance: 0n, nonce: BigInt(Number.MAX_SAFE_INTEGER) + 1n, code: '0x' }))
  // nonce as hex above MAX_SAFE_INTEGER
  const overflowHex = '0x' + (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(16)
  checkNull('nonce hex > MAX_SAFE_INTEGER -> null',
    toLiveFacts({ balance: 0n, nonce: overflowHex, code: '0x' }))
  checkNull('nonce non-hex string -> null', toLiveFacts({ balance: 0n, nonce: '0xgg',    code: '0x' }))

  // code: wrong types
  checkNull('code number -> null',   toLiveFacts({ balance: 0n, nonce: 0, code: 42 }))
  checkNull('code true -> null',     toLiveFacts({ balance: 0n, nonce: 0, code: true }))
  checkNull('code object -> null',   toLiveFacts({ balance: 0n, nonce: 0, code: {} }))
  checkNull('code non-hex string -> null', toLiveFacts({ balance: 0n, nonce: 0, code: 'deadbeef' }))
  // Odd-length hex body (not whole bytes)
  checkNull('code odd-length hex -> null', toLiveFacts({ balance: 0n, nonce: 0, code: '0x6' }))
}

// ---------------------------------------------------------------------------
// formatLiveBalance
// ---------------------------------------------------------------------------

console.log('\nformatLiveBalance')
{
  check('0 -> "0"',                   formatLiveBalance(0),          '0')
  check('tiny 0.0000004 -> "< 0.000001"', formatLiveBalance(0.0000004), '< 0.000001')
  check('0.000001 -> "0.000001"',     formatLiveBalance(0.000001),   '0.000001')
  check('0.000123 -> "0.000123"',     formatLiveBalance(0.000123),   '0.000123')
  check('0.5 -> "0.5"',               formatLiveBalance(0.5),        '0.5')
  check('1 -> "1.00"',                formatLiveBalance(1),          '1.00')
  check('1234.5678 -> "1,234.57"',    formatLiveBalance(1234.5678),  '1,234.57')
  check('1e9 -> "1,000,000,000.00"',  formatLiveBalance(1e9),        '1,000,000,000.00')
}

// ---------------------------------------------------------------------------
// liveKind
// ---------------------------------------------------------------------------

console.log('\nliveKind')
{
  const wallet: LiveFacts = { balanceUsdc: 1, sentTxCount: 5, isContract: false }
  const contract: LiveFacts = { balanceUsdc: 0, sentTxCount: 0, isContract: true }

  check('isContract false -> "wallet"',   liveKind(wallet),   'wallet')
  check('isContract true  -> "contract"', liveKind(contract), 'contract')
}

// ---------------------------------------------------------------------------
// Pinning checks (added after mutation testing)
// ---------------------------------------------------------------------------
{
  check('0.000001 is shown as-is, not as "tiny"', formatLiveBalance(0.000001), '0.000001')
  check('0.000005 keeps its digit', formatLiveBalance(0.000005), '0.000005')
  check('0.123456789 keeps 6 significant digits', formatLiveBalance(0.123456789), '0.123457')
  check('odd-length code hex is rejected', toLiveFacts({ balance: 0n, nonce: 0, code: '0x123' }), null)
  check('bigint nonce 0n is valid', toLiveFacts({ balance: 0n, nonce: 0n, code: undefined })?.sentTxCount, 0)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed}/${total} tests passed`)
if (passed < total) {
  process.exit(1)
}
