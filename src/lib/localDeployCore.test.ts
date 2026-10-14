/**
 * Tests for localDeployCore.ts pure logic.
 * Run with: node --experimental-strip-types src/lib/localDeployCore.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatFeeEstimate,
  bytecodeSizeBytes,
  addressesMatch,
  ownerMismatchWarning,
  verifyCodeResult,
  verifyOwnerResult,
  verifyFromResult,
} from './localDeployCore.ts'

// ── formatFeeEstimate ─────────────────────────────────────────────────────────

void test('formatFeeEstimate: null nativeDecimals returns unknown', () => {
  assert.equal(formatFeeEstimate(100n, 1n, null), 'unknown')
})

void test('formatFeeEstimate: non-integer nativeDecimals returns unknown', () => {
  assert.equal(formatFeeEstimate(100n, 1n, 1.5), 'unknown')
})

void test('formatFeeEstimate: negative nativeDecimals returns unknown', () => {
  assert.equal(formatFeeEstimate(100n, 1n, -1), 'unknown')
})

void test('formatFeeEstimate: zero gas estimate returns 0.00 USDC', () => {
  assert.equal(formatFeeEstimate(0n, 1000000000n, 18), '0.00 USDC')
})

void test('formatFeeEstimate: zero gas price returns 0.00 USDC', () => {
  assert.equal(formatFeeEstimate(100000n, 0n, 18), '0.00 USDC')
})

void test('formatFeeEstimate: does NOT assume 18 decimals — different decimals produce different results', () => {
  // 1_000_000 gas units * 1_000_000_000 wei/gas = 1_000_000_000_000_000 raw
  // With 18 decimals: 0.001 USDC
  // With 6 decimals: 1_000_000_000 USDC (very different)
  const r18 = formatFeeEstimate(1_000_000n, 1_000_000_000n, 18)
  const r6 = formatFeeEstimate(1_000_000n, 1_000_000_000n, 6)
  assert.notEqual(r18, r6)
  assert.ok(r18.includes('0.00'), `expected 0.00… got "${r18}"`)
})

void test('formatFeeEstimate: correct value with 18 decimals (1e15 raw = 0.001 USDC)', () => {
  // 1_000_000n gas * 1_000_000_000n gasPrice = 1_000_000_000_000_000n (1e15)
  // 1e15 / 1e18 = 0.001
  const result = formatFeeEstimate(1_000_000n, 1_000_000_000n, 18)
  assert.ok(result.startsWith('0.001'), `expected 0.001… got "${result}"`)
  assert.ok(result.includes('USDC'), `expected USDC suffix, got "${result}"`)
})

void test('formatFeeEstimate: ends with USDC', () => {
  const result = formatFeeEstimate(21_000n, 2_000_000_000n, 18)
  assert.ok(result.endsWith('USDC'), `expected USDC suffix, got "${result}"`)
})

// ── bytecodeSizeBytes ─────────────────────────────────────────────────────────

void test('bytecodeSizeBytes: 0x prefix stripped, 2 hex chars = 1 byte', () => {
  assert.equal(bytecodeSizeBytes('0xff'), 1)
  assert.equal(bytecodeSizeBytes('0xffff'), 2)
})

void test('bytecodeSizeBytes: without 0x prefix', () => {
  assert.equal(bytecodeSizeBytes('deadbeef'), 4)
})

void test('bytecodeSizeBytes: real GmBoard bytecode (even length)', () => {
  const hex = '0x6080604052' // 5 bytes
  assert.equal(bytecodeSizeBytes(hex), 5)
})

void test('bytecodeSizeBytes: empty string = 0 bytes', () => {
  assert.equal(bytecodeSizeBytes('0x'), 0)
  assert.equal(bytecodeSizeBytes(''), 0)
})

// ── addressesMatch ────────────────────────────────────────────────────────────

void test('addressesMatch: same address same case', () => {
  assert.ok(addressesMatch('0xabcdef', '0xabcdef'))
})

void test('addressesMatch: same address different case', () => {
  assert.ok(addressesMatch('0xABCDEF', '0xabcdef'))
  assert.ok(addressesMatch('0xAbCdEf', '0xABCDEF'))
})

void test('addressesMatch: different addresses', () => {
  assert.ok(!addressesMatch('0xaaaaaa', '0xbbbbbb'))
})

void test('addressesMatch: empty string returns false', () => {
  assert.ok(!addressesMatch('', '0xabc'))
  assert.ok(!addressesMatch('0xabc', ''))
})

// ── ownerMismatchWarning ──────────────────────────────────────────────────────

void test('ownerMismatchWarning: same address returns null', () => {
  const addr = '0x1234567890abcdef1234567890abcdef12345678'
  assert.equal(ownerMismatchWarning(addr, addr), null)
})

void test('ownerMismatchWarning: same address different case returns null', () => {
  assert.equal(
    ownerMismatchWarning(
      '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      '0xabcdef1234567890abcdef1234567890abcdef12',
    ),
    null,
  )
})

void test('ownerMismatchWarning: different address returns non-null string', () => {
  const w = ownerMismatchWarning(
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
  )
  assert.ok(w !== null, 'expected a warning string')
  assert.ok(typeof w === 'string' && w.length > 0)
})

void test('ownerMismatchWarning: empty intendedOwner returns null (no warning)', () => {
  assert.equal(ownerMismatchWarning('', '0xabc'), null)
})

// ── verifyCodeResult ──────────────────────────────────────────────────────────

void test('verifyCodeResult: real bytecode is ok=true', () => {
  const r = verifyCodeResult('0x6080604052')
  assert.equal(r.ok, true)
})

void test('verifyCodeResult: 0x is ok=false', () => {
  const r = verifyCodeResult('0x')
  assert.equal(r.ok, false)
})

void test('verifyCodeResult: undefined is ok=false', () => {
  const r = verifyCodeResult(undefined)
  assert.equal(r.ok, false)
})

// ── verifyOwnerResult ─────────────────────────────────────────────────────────

void test('verifyOwnerResult: matching addresses (case-insensitive) = ok', () => {
  const r = verifyOwnerResult(
    '0xABCDEF1234567890abcdef1234567890abcdef12',
    '0xabcdef1234567890abcdef1234567890abcdef12',
  )
  assert.equal(r.ok, true)
})

void test('verifyOwnerResult: mismatch = ok false', () => {
  const r = verifyOwnerResult(
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
  )
  assert.equal(r.ok, false)
})

void test('verifyOwnerResult: undefined onchainOwner = ok false', () => {
  const r = verifyOwnerResult(undefined, '0xabc')
  assert.equal(r.ok, false)
})

// ── verifyFromResult ──────────────────────────────────────────────────────────

void test('verifyFromResult: matching addresses = ok', () => {
  const addr = '0x1234567890abcdef1234567890abcdef12345678'
  const r = verifyFromResult(addr, addr.toUpperCase())
  assert.equal(r.ok, true)
})

void test('verifyFromResult: mismatch = ok false', () => {
  const r = verifyFromResult(
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
  )
  assert.equal(r.ok, false)
})

void test('verifyFromResult: undefined txFrom = ok false', () => {
  const r = verifyFromResult(undefined, '0xabc')
  assert.equal(r.ok, false)
})
