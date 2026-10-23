/**
 * Tests for src/lib/walletGas.ts
 * Run: node --experimental-strip-types --no-warnings src/lib/walletGas.test.ts
 *
 * Uses node:assert/strict only — no test framework.
 *
 * walletGas.ts imports compact from './numberFormat.ts' (relative, not '@/lib/arcscan')
 * so this file and its dependencies resolve under plain Node without a bundler.
 */

import assert from 'node:assert/strict'
import { compact } from './numberFormat.ts'
import { gasReport, formatGasUsd } from './walletGas.ts'

// compact imported to verify the relative path resolves; used explicitly in the ≥1000 test.
void (compact satisfies typeof compact)

let _n = 0

function test(label: string, fn: () => void): void {
  _n++
  fn() // hard-fail: AssertionError propagates to top level
}

// ── gasReport: tx = 0 ─────────────────────────────────────────────────────────

test('tx=0: sent=0, ok=0, reverted=0, revertedShare=null, avgFee=null, feePerActiveDay=null', () => {
  const r = gasReport({ tx: 0, failed: 0, feesUsdc: 0, usdcSent: 0, usdcReceived: 0, activeDays: 0, partial: false })
  assert.equal(r.sent, 0)
  assert.equal(r.ok, 0)
  assert.equal(r.reverted, 0)
  assert.equal(r.revertedShare, null)
  assert.equal(r.avgFee, null)
  assert.equal(r.feePerActiveDay, null)
  assert.equal(r.direction, 'flat')
  assert.equal(r.nonceAhead, null)
  assert.equal(r.partial, false)
})

// ── gasReport: failed > tx (clamp) ────────────────────────────────────────────

test('failed > tx: reverted clamped to tx', () => {
  const r = gasReport({ tx: 3, failed: 10, feesUsdc: 0.003, usdcSent: 0, usdcReceived: 0, activeDays: 1, partial: false })
  assert.equal(r.sent, 3)
  assert.equal(r.reverted, 3)  // min(10, 3) = 3
  assert.equal(r.ok, 0)
  assert.equal(r.revertedShare, 1)
})

// ── gasReport: net exactly ±0.005 boundaries ──────────────────────────────────

test('netUsdc = +0.005 → direction flat (boundary not > 0.005)', () => {
  const r = gasReport({ tx: 0, failed: 0, feesUsdc: 0, usdcSent: 0, usdcReceived: 0.005, activeDays: 0, partial: false })
  assert.equal(r.netUsdc, 0.005)
  assert.equal(r.direction, 'flat')
})

test('netUsdc = +0.0051 → direction in', () => {
  const r = gasReport({ tx: 0, failed: 0, feesUsdc: 0, usdcSent: 0, usdcReceived: 0.0051, activeDays: 0, partial: false })
  assert.equal(r.direction, 'in')
})

test('netUsdc = -0.005 → direction flat', () => {
  const r = gasReport({ tx: 0, failed: 0, feesUsdc: 0, usdcSent: 0.005, usdcReceived: 0, activeDays: 0, partial: false })
  assert.equal(r.direction, 'flat')
})

test('netUsdc = -0.0051 → direction out', () => {
  const r = gasReport({ tx: 0, failed: 0, feesUsdc: 0, usdcSent: 0.0051, usdcReceived: 0, activeDays: 0, partial: false })
  assert.equal(r.direction, 'out')
})

// ── gasReport: live null ───────────────────────────────────────────────────────

test('live = null → nonceAhead = null', () => {
  const r = gasReport({ tx: 5, failed: 0, feesUsdc: 0.01, usdcSent: 0, usdcReceived: 0, activeDays: 3, partial: false }, null)
  assert.equal(r.nonceAhead, null)
})

// ── gasReport: live nonce below and above tx ───────────────────────────────────

test('live.sentTxCount < sent → nonceAhead = 0 (clamp)', () => {
  const r = gasReport(
    { tx: 10, failed: 0, feesUsdc: 0, usdcSent: 0, usdcReceived: 0, activeDays: 5, partial: false },
    { sentTxCount: 7 },
  )
  assert.equal(r.nonceAhead, 0)
})

test('live.sentTxCount = sent → nonceAhead = 0', () => {
  const r = gasReport(
    { tx: 10, failed: 0, feesUsdc: 0, usdcSent: 0, usdcReceived: 0, activeDays: 5, partial: false },
    { sentTxCount: 10 },
  )
  assert.equal(r.nonceAhead, 0)
})

test('live.sentTxCount > sent → nonceAhead = delta', () => {
  const r = gasReport(
    { tx: 10, failed: 0, feesUsdc: 0, usdcSent: 0, usdcReceived: 0, activeDays: 5, partial: false },
    { sentTxCount: 13 },
  )
  assert.equal(r.nonceAhead, 3)
})

// ── gasReport: partial passthrough ────────────────────────────────────────────

test('partial = true passes through', () => {
  const r = gasReport({ tx: 1, failed: 0, feesUsdc: 0.001, usdcSent: 0, usdcReceived: 0, activeDays: 1, partial: true })
  assert.equal(r.partial, true)
})

// ── gasReport: negative inputs treated as 0 ───────────────────────────────────

test('negative tx treated as 0', () => {
  const r = gasReport({ tx: -5, failed: 0, feesUsdc: 0, usdcSent: 0, usdcReceived: 0, activeDays: 0, partial: false })
  assert.equal(r.sent, 0)
})

test('negative feesUsdc treated as 0', () => {
  const r = gasReport({ tx: 2, failed: 0, feesUsdc: -1, usdcSent: 0, usdcReceived: 0, activeDays: 1, partial: false })
  assert.equal(r.fees, 0)
})

// ── gasReport: avgFee and feePerActiveDay ─────────────────────────────────────

test('avgFee = fees / sent, feePerActiveDay = fees / activeDays', () => {
  const r = gasReport({ tx: 4, failed: 0, feesUsdc: 0.02, usdcSent: 0, usdcReceived: 0, activeDays: 2, partial: false })
  assert.ok(Math.abs(r.avgFee! - 0.005) < 1e-10)
  assert.ok(Math.abs(r.feePerActiveDay! - 0.01) < 1e-10)
})

// ── formatGasUsd: zero ────────────────────────────────────────────────────────

test('formatGasUsd(0) = "$0"', () => {
  assert.equal(formatGasUsd(0), '$0')
})

// ── formatGasUsd: < 0.01 band (3 significant figures via toPrecision(3)) ──────

test('formatGasUsd(0.0000421) = "$0.0000421" (toPrecision(3))', () => {
  // (0.0000421).toPrecision(3) = '0.0000421'
  assert.equal(formatGasUsd(0.0000421), '$0.0000421')
})

test('formatGasUsd(0.0099) in < 0.01 band', () => {
  // (0.0099).toPrecision(3) = '0.00990'
  assert.equal(formatGasUsd(0.0099), '$0.00990')
})

// ── formatGasUsd: 0.01 ≤ n < 1000 band ───────────────────────────────────────

test('formatGasUsd(0.01) enters mid band', () => {
  assert.equal(formatGasUsd(0.01), '$0.01')
})

test('formatGasUsd(0.0185) trimmed correctly', () => {
  assert.equal(formatGasUsd(0.0185), '$0.0185')
})

test('formatGasUsd(12.40) keeps trailing zero at 2 dp', () => {
  assert.equal(formatGasUsd(12.40), '$12.40')
})

test('formatGasUsd(999.99) stays in mid band', () => {
  assert.equal(formatGasUsd(999.99), '$999.99')
})

// W1: |n| >= 1 and < 1000 → exactly 2 decimals
test('formatGasUsd(307.803) → "$307.80" (exactly 2 dp, truncated/rounded)', () => {
  // Real case: +$307.803 must show as $307.80
  assert.equal(formatGasUsd(307.803), '$307.80')
})

test('formatGasUsd(1.0) → "$1.00" (exactly 2 dp)', () => {
  assert.equal(formatGasUsd(1.0), '$1.00')
})

test('formatGasUsd(1.5555) → "$1.56" (exactly 2 dp, rounds)', () => {
  assert.equal(formatGasUsd(1.5555), '$1.56')
})

// ── formatGasUsd: ≥ 1000 band (compact) ──────────────────────────────────────

test('formatGasUsd(1000) enters compact band', () => {
  // compact(1000, 2) = '1.00K'
  assert.equal(formatGasUsd(1000), `$${compact(1000, 2)}`)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`walletGas: ${_n} tests passed.`)
