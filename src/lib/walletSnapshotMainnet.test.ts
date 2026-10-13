/**
 * Tests for walletSnapshotMainnet.ts
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/walletSnapshotMainnet.test.ts
 *
 * Uses node:assert/strict only — no external test runner.
 */

import assert from 'node:assert/strict'
import { toMainnetSnapshot } from './walletSnapshotMainnet.ts'
import type { MainnetLiveFacts, MainnetIndexRecord } from './walletSnapshotMainnet.ts'

// ── Helpers ────────────────────────────────────────────────────────────────────

const ADDR = '0xAbCd000000000000000000000000000000000001'

const liveFull: MainnetLiveFacts = {
  balanceUsdc: 1234.56,
  sentTxCount: 42,
  isContract: false,
}

const liveContract: MainnetLiveFacts = {
  balanceUsdc: 0,
  isContract: true,
  sentTxCount: 0,
}

const indexRecord: MainnetIndexRecord = {
  // day 10 from EPOCH = 2026-01-11 UTC
  l: 10,
}

// ── Test: index present, wallet address ───────────────────────────────────────

{
  const snap = toMainnetSnapshot(ADDR, liveFull, indexRecord)
  assert.notEqual(snap, null, 'should return a snapshot when live is non-null')
  assert.equal(snap!.address, ADDR)
  assert.equal(snap!.balance, 1234.56)
  assert.equal(snap!.isContract, false)
  assert.equal(snap!.name, null)
  assert.equal(snap!.txCount, 42)
  assert.equal(typeof snap!.lastActive, 'string', 'lastActive should be a string when indexed')
  assert.match(snap!.lastActive!, /^2026-01-11/, 'day 10 should be 2026-01-11')
  assert.equal(snap!.txns24h, undefined)
  assert.equal(snap!.txns24hCapped, undefined)
  console.log('PASS: index present, wallet address')
}

// ── Test: index absent (address not indexed) ──────────────────────────────────

{
  const snap = toMainnetSnapshot(ADDR, liveFull, null)
  assert.notEqual(snap, null)
  assert.equal(snap!.lastActive, null, 'lastActive should be null when not indexed')
  assert.equal(snap!.balance, 1234.56)
  assert.equal(snap!.txCount, 42)
  console.log('PASS: index absent → lastActive null')
}

// ── Test: live is null (RPC failure) ─────────────────────────────────────────

{
  const snap = toMainnetSnapshot(ADDR, null, indexRecord)
  assert.equal(snap, null, 'should return null when live is null')
  console.log('PASS: live null → snapshot null')
}

// ── Test: live is null and record is null ─────────────────────────────────────

{
  const snap = toMainnetSnapshot(ADDR, null, null)
  assert.equal(snap, null)
  console.log('PASS: both null → snapshot null')
}

// ── Test: isContract = true ────────────────────────────────────────────────────

{
  const snap = toMainnetSnapshot(ADDR, liveContract, null)
  assert.notEqual(snap, null)
  assert.equal(snap!.isContract, true)
  assert.equal(snap!.balance, 0)
  assert.equal(snap!.txCount, 0)
  console.log('PASS: isContract true, balance 0')
}

// ── Test: balance exactly 0 (wallet exists, just empty) ───────────────────────

{
  const zeroLive: MainnetLiveFacts = { balanceUsdc: 0, sentTxCount: 0, isContract: false }
  const snap = toMainnetSnapshot(ADDR, zeroLive, null)
  assert.notEqual(snap, null)
  assert.equal(snap!.balance, 0)
  console.log('PASS: balance 0 is valid')
}

// ── Test: large txCount (nonce) ───────────────────────────────────────────────

{
  const bigLive: MainnetLiveFacts = {
    balanceUsdc: 9_999_999.999999,
    sentTxCount: Number.MAX_SAFE_INTEGER,
    isContract: false,
  }
  const snap = toMainnetSnapshot(ADDR, bigLive, indexRecord)
  assert.notEqual(snap, null)
  assert.equal(snap!.txCount, Number.MAX_SAFE_INTEGER)
  assert.equal(snap!.balance, 9_999_999.999999)
  console.log('PASS: large numbers preserved')
}

// ── Test: lastActive ISO format for day 0 (epoch) ────────────────────────────

{
  const snap = toMainnetSnapshot(ADDR, liveFull, { l: 0 })
  assert.notEqual(snap, null)
  assert.match(snap!.lastActive!, /^2026-01-01/, 'day 0 should be 2026-01-01')
  console.log('PASS: day 0 = 2026-01-01')
}

// ── Test: lastActive ISO format for a future day ─────────────────────────────

{
  // day 284 = 2026-10-12 UTC  (2026-01-01 + 284 days)
  const snap = toMainnetSnapshot(ADDR, liveFull, { l: 284 })
  assert.notEqual(snap, null)
  // Just verify it's a valid ISO-8601 string parseable as a Date
  const d = new Date(snap!.lastActive!)
  assert.equal(isNaN(d.getTime()), false, 'lastActive must be a valid date string')
  console.log(`PASS: day 284 → ${snap!.lastActive}`)
}

console.log('\nAll tests passed.')
