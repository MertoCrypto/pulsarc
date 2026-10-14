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
  isValidTxHash,
  isValidAddress,
  isValidNonZeroAddress,
  validateTreasuryArg,
  validateTokenStringArg,
  storageKey,
  parseStoredDeploys,
  validateStoredEntry,
  mergeDeployRecord,
  removeDeployRecord,
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

// ── isValidTxHash ─────────────────────────────────────────────────────────────

void test('isValidTxHash: valid hash (lowercase hex)', () => {
  const h = '0x' + 'a'.repeat(64)
  assert.ok(isValidTxHash(h))
})

void test('isValidTxHash: valid hash (mixed case)', () => {
  const h = '0x' + 'aAbBcCdDeEfF0123456789'.repeat(2) + 'aAbBcCdDeEfF01234567'
  assert.equal(h.length, 66)
  assert.ok(isValidTxHash(h))
})

void test('isValidTxHash: too short (63 hex chars)', () => {
  assert.ok(!isValidTxHash('0x' + 'a'.repeat(63)))
})

void test('isValidTxHash: too long (65 hex chars)', () => {
  assert.ok(!isValidTxHash('0x' + 'a'.repeat(65)))
})

void test('isValidTxHash: missing 0x prefix', () => {
  assert.ok(!isValidTxHash('a'.repeat(64)))
})

void test('isValidTxHash: contains non-hex character', () => {
  assert.ok(!isValidTxHash('0x' + 'g'.repeat(64)))
})

void test('isValidTxHash: empty string', () => {
  assert.ok(!isValidTxHash(''))
})

// ── isValidAddress / isValidNonZeroAddress ────────────────────────────────────

void test('isValidAddress: valid 40-char lowercase', () => {
  assert.ok(isValidAddress('0x' + 'a'.repeat(40)))
})

void test('isValidAddress: valid mixed-case (checksum)', () => {
  assert.ok(isValidAddress('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'))
})

void test('isValidAddress: zero address is valid', () => {
  assert.ok(isValidAddress('0x' + '0'.repeat(40)))
})

void test('isValidAddress: too short', () => {
  assert.ok(!isValidAddress('0x' + 'a'.repeat(39)))
})

void test('isValidAddress: too long', () => {
  assert.ok(!isValidAddress('0x' + 'a'.repeat(41)))
})

void test('isValidAddress: no 0x prefix', () => {
  assert.ok(!isValidAddress('a'.repeat(40)))
})

void test('isValidNonZeroAddress: non-zero = true', () => {
  assert.ok(isValidNonZeroAddress('0x' + 'a'.repeat(40)))
})

void test('isValidNonZeroAddress: zero address = false', () => {
  assert.ok(!isValidNonZeroAddress('0x' + '0'.repeat(40)))
})

void test('isValidNonZeroAddress: invalid format = false', () => {
  assert.ok(!isValidNonZeroAddress('not-an-address'))
})

// ── validateTreasuryArg ───────────────────────────────────────────────────────

void test('validateTreasuryArg: valid non-zero address', () => {
  const r = validateTreasuryArg('0x' + 'a'.repeat(40))
  assert.ok(r.ok)
})

void test('validateTreasuryArg: zero address fails', () => {
  const r = validateTreasuryArg('0x' + '0'.repeat(40))
  assert.ok(!r.ok)
  assert.ok(r.message.includes('zero'))
})

void test('validateTreasuryArg: bad checksum but valid all-lowercase hex is accepted', () => {
  // All-lowercase is syntactically valid — isValidAddress only checks format, not EIP-55
  const r = validateTreasuryArg('0xabcdef1234567890abcdef1234567890abcdef12')
  assert.ok(r.ok)
})

void test('validateTreasuryArg: whitespace padded is rejected', () => {
  const r = validateTreasuryArg('  0x' + 'a'.repeat(40))
  assert.ok(!r.ok)
  assert.ok(r.message.includes('whitespace'))
})

void test('validateTreasuryArg: trailing space is rejected', () => {
  const r = validateTreasuryArg('0x' + 'a'.repeat(40) + ' ')
  assert.ok(!r.ok)
})

void test('validateTreasuryArg: too short fails', () => {
  const r = validateTreasuryArg('0x' + 'a'.repeat(38))
  assert.ok(!r.ok)
})

// ── validateTokenStringArg ────────────────────────────────────────────────────

void test('validateTokenStringArg: valid name', () => {
  const r = validateTokenStringArg('Arc Watchlist', 'name_')
  assert.ok(r.ok)
})

void test('validateTokenStringArg: valid symbol', () => {
  const r = validateTokenStringArg('ARCW', 'symbol_')
  assert.ok(r.ok)
})

void test('validateTokenStringArg: exactly 32 chars is ok', () => {
  const r = validateTokenStringArg('A'.repeat(32), 'name_')
  assert.ok(r.ok)
})

void test('validateTokenStringArg: 33 chars fails', () => {
  const r = validateTokenStringArg('A'.repeat(33), 'name_')
  assert.ok(!r.ok)
  assert.ok(r.message.includes('32'))
})

void test('validateTokenStringArg: empty fails', () => {
  const r = validateTokenStringArg('', 'name_')
  assert.ok(!r.ok)
})

void test('validateTokenStringArg: leading space fails', () => {
  const r = validateTokenStringArg(' ARCW', 'symbol_')
  assert.ok(!r.ok)
  assert.ok(r.message.includes('whitespace'))
})

void test('validateTokenStringArg: trailing space fails', () => {
  const r = validateTokenStringArg('ARCW ', 'symbol_')
  assert.ok(!r.ok)
})

void test('validateTokenStringArg: non-printable ASCII fails', () => {
  const r = validateTokenStringArg('Arc\x01Board', 'name_')
  assert.ok(!r.ok)
  assert.ok(r.message.includes('printable'))
})

void test('validateTokenStringArg: unicode char fails', () => {
  const r = validateTokenStringArg('Arc\u2019s', 'name_')
  assert.ok(!r.ok)
})

// ── storageKey ────────────────────────────────────────────────────────────────

void test('storageKey: includes chainId', () => {
  assert.ok(storageKey(5042002).includes('5042002'))
  assert.ok(storageKey(5042).includes('5042'))
})

void test('storageKey: different chainIds produce different keys', () => {
  assert.notEqual(storageKey(5042), storageKey(5042002))
})

// ── validateStoredEntry ───────────────────────────────────────────────────────

const VALID_ENTRY = {
  name: 'GmBoard',
  address: '0x' + 'a'.repeat(40),
  txHash: '0x' + 'b'.repeat(64),
  chainId: 5042002,
  deployer: '0x' + 'c'.repeat(40),
}

void test('validateStoredEntry: valid entry passes', () => {
  const r = validateStoredEntry(VALID_ENTRY)
  assert.ok(r !== null)
  assert.equal(r?.name, 'GmBoard')
})

void test('validateStoredEntry: null returns null', () => {
  assert.equal(validateStoredEntry(null), null)
})

void test('validateStoredEntry: non-object returns null', () => {
  assert.equal(validateStoredEntry('string'), null)
  assert.equal(validateStoredEntry(42), null)
})

void test('validateStoredEntry: missing name returns null', () => {
  const e = { ...VALID_ENTRY, name: '' }
  assert.equal(validateStoredEntry(e), null)
})

void test('validateStoredEntry: bad address format returns null', () => {
  const e = { ...VALID_ENTRY, address: 'not-an-address' }
  assert.equal(validateStoredEntry(e), null)
})

void test('validateStoredEntry: bad txHash returns null', () => {
  const e = { ...VALID_ENTRY, txHash: '0x' + 'a'.repeat(63) }
  assert.equal(validateStoredEntry(e), null)
})

void test('validateStoredEntry: non-integer chainId returns null', () => {
  const e = { ...VALID_ENTRY, chainId: 1.5 }
  assert.equal(validateStoredEntry(e), null)
})

// ── parseStoredDeploys ────────────────────────────────────────────────────────

void test('parseStoredDeploys: null returns []', () => {
  assert.deepEqual(parseStoredDeploys(null), [])
})

void test('parseStoredDeploys: empty string returns []', () => {
  assert.deepEqual(parseStoredDeploys(''), [])
})

void test('parseStoredDeploys: invalid JSON returns []', () => {
  assert.deepEqual(parseStoredDeploys('{bad json'), [])
})

void test('parseStoredDeploys: non-array JSON returns []', () => {
  assert.deepEqual(parseStoredDeploys('{"a":1}'), [])
})

void test('parseStoredDeploys: valid array returns records', () => {
  const raw = JSON.stringify([VALID_ENTRY])
  const r = parseStoredDeploys(raw)
  assert.equal(r.length, 1)
  assert.equal(r[0]?.name, 'GmBoard')
})

void test('parseStoredDeploys: malformed entries are dropped silently', () => {
  const raw = JSON.stringify([VALID_ENTRY, { bad: 'data' }, VALID_ENTRY])
  const r = parseStoredDeploys(raw)
  // Both valid entries survive; the malformed one is dropped
  assert.equal(r.length, 2)
})

// ── mergeDeployRecord ─────────────────────────────────────────────────────────

void test('mergeDeployRecord: appends when no existing entry with same name+chain', () => {
  const existing = [{ ...VALID_ENTRY, name: 'TipJar' }]
  const result = mergeDeployRecord(existing, VALID_ENTRY)
  assert.equal(result.length, 2)
})

void test('mergeDeployRecord: replaces when same name+chain already exists', () => {
  const newEntry = { ...VALID_ENTRY, address: '0x' + 'd'.repeat(40) }
  const result = mergeDeployRecord([VALID_ENTRY], newEntry)
  assert.equal(result.length, 1)
  assert.equal(result[0]?.address, newEntry.address)
})

void test('mergeDeployRecord: different chainId creates separate entry', () => {
  const other = { ...VALID_ENTRY, chainId: 5042 }
  const result = mergeDeployRecord([VALID_ENTRY], other)
  assert.equal(result.length, 2)
})

// ── removeDeployRecord ────────────────────────────────────────────────────────

void test('removeDeployRecord: removes matching entry', () => {
  const result = removeDeployRecord([VALID_ENTRY], 'GmBoard', 5042002)
  assert.equal(result.length, 0)
})

void test('removeDeployRecord: leaves non-matching entries', () => {
  const tipJar = { ...VALID_ENTRY, name: 'TipJar' }
  const result = removeDeployRecord([VALID_ENTRY, tipJar], 'GmBoard', 5042002)
  assert.equal(result.length, 1)
  assert.equal(result[0]?.name, 'TipJar')
})

void test('removeDeployRecord: no-op when entry not found', () => {
  const result = removeDeployRecord([VALID_ENTRY], 'NonExistent', 5042002)
  assert.equal(result.length, 1)
})
