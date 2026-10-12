/**
 * Unit tests for numberFormat.ts
 * Run: node --experimental-strip-types --no-warnings src/lib/numberFormat.test.ts
 */

import assert from 'node:assert/strict'
import { scaled, isAddress, compact, count, timeAgo } from './numberFormat.ts'

let passed = 0
function ok(label: string, condition: boolean): void {
  assert.ok(condition, label)
  passed++
}
function eq<T>(label: string, actual: T, expected: T): void {
  assert.deepStrictEqual(actual, expected, label)
  passed++
}

// ---------------------------------------------------------------------------
// scaled
// ---------------------------------------------------------------------------

// null / undefined / '' -> 0
eq('scaled(null, 6) === 0',      scaled(null,      6), 0)
eq('scaled(undefined, 6) === 0', scaled(undefined, 6), 0)
eq("scaled('', 6) === 0",        scaled('',        6), 0)

// '0' with 0 decimals -> 0
// padStart(1,'0') = '0'; whole = s.slice(0, 1-0=1) = '0'; frac = s.slice(1) = ''
// Number('0.') = 0
eq("scaled('0', 0) === 0",  scaled('0', 0),  0)

// '1000000' with 6 decimals -> 1
// padStart(7,'0') = '1000000'; whole = s.slice(0,1) = '1'; frac = s.slice(1) = '000000'
// Number('1.000000') = 1
eq("scaled('1000000', 6) === 1",  scaled('1000000', 6),  1)

// '1' with 6 decimals -> 0.000001
// padStart(7,'0') = '0000001'; whole = '0'; frac = '000001'
// Number('0.000001') = 0.000001
eq("scaled('1', 6) === 0.000001", scaled('1', 6), 0.000001)

// '123456789' with 6 decimals -> 123.456789
// len 9 >= 7, no padding; whole = s.slice(0,3) = '123'; frac = '456789'
eq("scaled('123456789', 6) === 123.456789", scaled('123456789', 6), 123.456789)

// '5' with 18 decimals -> 5e-18
// padStart(19,'0') = '0000000000000000005'; whole = '0'; frac = '000000000000000005'
// Number('0.000000000000000005') = 5e-18
eq("scaled('5', 18) === 5e-18", scaled('5', 18), 5e-18)

// decimals as a string '6' -> same as numeric 6
eq("scaled('1000000', '6') === 1", scaled('1000000', '6' as unknown as number), 1)

// decimals null -> treated as 0; raw '42' -> 42
// d = Number(null ?? 0) = 0; padStart(1,'0') = '42' (len 2 >= 1); whole = s.slice(0,2) = '42'
// frac = s.slice(2) = ''; Number('42.') = 42
eq("scaled('42', null) === 42", scaled('42', null), 42)

// decimals undefined -> treated as 0; same logic
eq("scaled('42', undefined) === 42", scaled('42', undefined), 42)

// decimals NaN-like ('abc') -> !Number.isFinite(NaN) -> 0
eq("scaled('42', 'abc') === 0", scaled('42', 'abc' as unknown as number), 0)

// 18-decimal USDC-style '1500000000000000000' -> 1.5
// len 19 = d+1=19, no padding; whole = s.slice(0,1) = '1'; frac = s.slice(1) = '500000000000000000'
eq("scaled('1500000000000000000', 18) === 1.5", scaled('1500000000000000000', 18), 1.5)

// very large raw integer does not throw
{
  const big = '9'.repeat(30)
  let threw = false
  try { scaled(big, 0) } catch { threw = true }
  ok('scaled(very large raw, 0) does not throw', !threw)
}

// ---------------------------------------------------------------------------
// isAddress
// ---------------------------------------------------------------------------

// valid lowercase
ok('isAddress valid lowercase',
  isAddress('0xabcdef1234567890abcdef1234567890abcdef12'))

// valid uppercase
ok('isAddress valid uppercase',
  isAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12'))

// valid mixed-case
ok('isAddress valid mixed-case',
  isAddress('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'))

// missing 0x prefix -> false
ok('isAddress missing 0x -> false',
  !isAddress('abcdef1234567890abcdef1234567890abcdef12'))

// 39 hex chars after 0x -> false
ok('isAddress 39 hex chars -> false',
  !isAddress('0xabcdef1234567890abcdef1234567890abcdef1'))

// 41 hex chars after 0x -> false
ok('isAddress 41 hex chars -> false',
  !isAddress('0xabcdef1234567890abcdef1234567890abcdef123'))

// non-hex character -> false
ok('isAddress non-hex char -> false',
  !isAddress('0xabcdef1234567890abcdef1234567890abcdeXYZ'))

// leading space -> false
ok('isAddress leading space -> false',
  !isAddress(' 0xabcdef1234567890abcdef1234567890abcdef12'))

// trailing space -> false
ok('isAddress trailing space -> false',
  !isAddress('0xabcdef1234567890abcdef1234567890abcdef12 '))

// empty string -> false
ok('isAddress empty string -> false', !isAddress(''))

// ---------------------------------------------------------------------------
// compact
// ---------------------------------------------------------------------------

// --- boundary: 999 (< 1000, abs >= 10) -> toFixed(0) = '999'
eq("compact(999) === '999'",    compact(999),    '999')

// --- boundary: 1000 (>= 1e3, default digits=2) -> (1000/1e3).toFixed(2) = '1.00K'
eq("compact(1000) === '1.00K'", compact(1000),   '1.00K')

// --- boundary: 999999 -> (999999/1e3).toFixed(2); 999999/1000=999.999; toFixed(2)='1000.00'
// -> '1000.00K'
eq("compact(999999) === '1000.00K'", compact(999999), '1000.00K')

// --- boundary: 1e6 (>= 1e6) -> (1e6/1e6).toFixed(2) = '1.00M'
eq("compact(1e6) === '1.00M'",  compact(1e6),    '1.00M')

// --- boundary: 1e9 -> '1.00B'
eq("compact(1e9) === '1.00B'",  compact(1e9),    '1.00B')

// --- boundary: 1e12 -> '1.00T'
eq("compact(1e12) === '1.00T'", compact(1e12),   '1.00T')

// --- digits=0
eq("compact(1000, 0) === '1K'",  compact(1000, 0),  '1K')
eq("compact(1e6, 0) === '1M'",   compact(1e6,  0),  '1M')
eq("compact(1e9, 0) === '1B'",   compact(1e9,  0),  '1B')
eq("compact(1e12, 0) === '1T'",  compact(1e12, 0),  '1T')

// --- digits=3
eq("compact(1000, 3) === '1.000K'",  compact(1000, 3),  '1.000K')
eq("compact(1e6, 3) === '1.000M'",   compact(1e6,  3),  '1.000M')

// --- negative: -1500 (abs >= 1e3) -> (-1500/1e3).toFixed(2) = '-1.50K'
eq("compact(-1500) === '-1.50K'", compact(-1500), '-1.50K')

// --- below 10: 5 -> abs < 10 -> toFixed(2) = '5.00'
eq("compact(5) === '5.00'",      compact(5),      '5.00')

// --- 9.999 -> abs < 10 -> (9.999).toFixed(2) = '10.00' (rounds up)
eq("compact(9.999) === '10.00'", compact(9.999),  '10.00')

// --- 10 -> abs >= 10 -> toFixed(0) = '10'
eq("compact(10) === '10'",       compact(10),     '10')

// --- 999.5 -> abs >= 10 -> (999.5).toFixed(0) = '1000' (JS rounds .5 up)
eq("compact(999.5) === '1000'",  compact(999.5),  '1000')

// --- 0 -> abs=0 < 10 -> (0).toFixed(2) = '0.00'
eq("compact(0) === '0.00'",      compact(0),      '0.00')

// ---------------------------------------------------------------------------
// count
// ---------------------------------------------------------------------------

// 999.6 -> abs < 1000 -> String(Math.round(999.6)) = String(1000) = '1000'
eq("count(999.6) === '1000'",  count(999.6),  '1000')

// 1000 -> not < 1000 -> compact(1000, 1) = (1000/1e3).toFixed(1) = '1.0K'
eq("count(1000) === '1.0K'",   count(1000),   '1.0K')

// -5 -> abs=5 < 1000 -> String(Math.round(-5)) = '-5'
eq("count(-5) === '-5'",       count(-5),     '-5')

// 1e9 -> compact(1e9, 1) = (1e9/1e9).toFixed(1) = '1.0B'
eq("count(1e9) === '1.0B'",    count(1e9),    '1.0B')

// ---------------------------------------------------------------------------
// timeAgo
// ---------------------------------------------------------------------------

// null / undefined / '' -> '—'
eq("timeAgo(null) === '—'",      timeAgo(null),      '—')
eq("timeAgo(undefined) === '—'", timeAgo(undefined), '—')
eq("timeAgo('') === '—'",        timeAgo(''),        '—')

{
  // Fix a stable "now" for all relative tests.
  const fakeNow = 1_000_000_000_000 // ms since epoch
  const realDateNow = Date.now
  Date.now = () => fakeNow

  function isoMsAgo(ms: number): string {
    return new Date(fakeNow - ms).toISOString()
  }

  try {
    // 30 s ago -> Math.floor(30) = 30 -> '30s ago'
    eq("timeAgo 30s ago === '30s ago'",
       timeAgo(isoMsAgo(30_000)), '30s ago')

    // 59 s ago -> '59s ago'
    eq("timeAgo 59s ago === '59s ago'",
       timeAgo(isoMsAgo(59_000)), '59s ago')

    // 60 s ago -> Math.floor(60/60)=1 -> '1m ago'
    eq("timeAgo 60s ago === '1m ago'",
       timeAgo(isoMsAgo(60_000)), '1m ago')

    // 3599 s ago -> Math.floor(3599/60)=59 -> '59m ago'
    eq("timeAgo 3599s ago === '59m ago'",
       timeAgo(isoMsAgo(3_599_000)), '59m ago')

    // 3600 s ago -> Math.floor(3600/3600)=1 -> '1h ago'
    eq("timeAgo 3600s ago === '1h ago'",
       timeAgo(isoMsAgo(3_600_000)), '1h ago')

    // 86399 s ago -> Math.floor(86399/3600)=23 -> '23h ago'
    eq("timeAgo 86399s ago === '23h ago'",
       timeAgo(isoMsAgo(86_399_000)), '23h ago')

    // 86400 s ago -> Math.floor(86400/86400)=1 -> '1d ago'
    eq("timeAgo 86400s ago === '1d ago'",
       timeAgo(isoMsAgo(86_400_000)), '1d ago')

    // future timestamp -> Math.max(0, negative) = 0 -> '0s ago'
    eq("timeAgo future timestamp === '0s ago'",
       timeAgo(isoMsAgo(-60_000)), '0s ago')

  } finally {
    Date.now = realDateNow
  }
}

// ---------------------------------------------------------------------------
console.log(`\nAll ${passed} assertions passed.`)
