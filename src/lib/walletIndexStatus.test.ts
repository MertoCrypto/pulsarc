/**
 * Tests for walletIndexStatus.ts
 * Run with: node --experimental-strip-types src/lib/walletIndexStatus.test.ts
 *
 * Uses plain node:assert — no test framework, no sandbox stubs.
 */

import assert from 'node:assert/strict'
import { indexStatus } from './walletIndexStatus.ts'
import { EPOCH_MS } from './walletIndex.ts'

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a nowMs for a given UTC day offset from EPOCH_MS.
 * e.g. dayMs(5) = 2026-01-06 00:00:00 UTC
 */
function dayMs(dayOffset: number): number {
  return EPOCH_MS + dayOffset * 86_400_000
}

/**
 * Minimal valid MetaJson factory.
 * since defaults to 5, through defaults to throughDay,
 * gaps defaults to [], walletCount defaults to 1000, lite defaults to false.
 */
function meta(
  throughDay: number,
  gaps: number[] = [],
  walletCount = 1_000,
  since = 5,
) {
  return { since, through: throughDay, gaps, walletCount, lite: false }
}

// ── Tests ────────────────────────────────────────────────────────────────────

// 1. ok — index is current (daysBehind = 0, no gaps)
{
  const now = dayMs(10)            // today is day 10
  const m = meta(10)               // through = day 10
  const result = indexStatus(m, now)
  assert.equal(result.state, 'ok', 'test 1: state should be ok')
  assert.equal(result.daysBehind, 0, 'test 1: daysBehind should be 0')
  console.log('PASS test 1: ok state, daysBehind=0')
}

// 2. ok — daysBehind = 2 (boundary: exactly 2 is NOT behind)
{
  const now = dayMs(12)            // today is day 12
  const m = meta(10)               // through = day 10
  const result = indexStatus(m, now)
  assert.equal(result.state, 'ok', 'test 2: state should be ok at boundary daysBehind=2')
  assert.equal(result.daysBehind, 2, 'test 2: daysBehind should be 2')
  console.log('PASS test 2: ok state at boundary daysBehind=2')
}

// 3. behind — daysBehind = 3 (just over boundary)
{
  const now = dayMs(13)            // today is day 13
  const m = meta(10)               // through = day 10
  const result = indexStatus(m, now)
  assert.equal(result.state, 'behind', 'test 3: state should be behind at daysBehind=3')
  assert.equal(result.daysBehind, 3, 'test 3: daysBehind should be 3')
  console.log('PASS test 3: behind at daysBehind=3')
}

// 4. gaps only — daysBehind = 1, meta.gaps non-empty
{
  const now = dayMs(11)            // today is day 11
  const m = meta(10, [7])          // through = day 10, one gap
  const result = indexStatus(m, now)
  assert.equal(result.state, 'gaps', 'test 4: state should be gaps')
  assert.equal(result.daysBehind, 1, 'test 4: daysBehind should be 1')
  console.log('PASS test 4: gaps state')
}

// 5. behind wins over gaps — daysBehind = 5 AND gaps non-empty
{
  const now = dayMs(20)            // today is day 20
  const m = meta(15, [10, 12])     // through = day 15, two gaps
  const result = indexStatus(m, now)
  assert.equal(result.state, 'behind', 'test 5: behind should win over gaps')
  assert.equal(result.daysBehind, 5, 'test 5: daysBehind should be 5')
  console.log('PASS test 5: behind wins over gaps')
}

// 6. boundary daysBehind = 2 with gaps present — gaps should show (not behind)
{
  const now = dayMs(12)            // today is day 12
  const m = meta(10, [8])          // through = day 10, one gap
  const result = indexStatus(m, now)
  assert.equal(result.state, 'gaps', 'test 6: at daysBehind=2 with gaps, state should be gaps not behind')
  assert.equal(result.daysBehind, 2, 'test 6: daysBehind should be 2')
  console.log('PASS test 6: gaps wins at boundary daysBehind=2')
}

// 7. daysBehind = 0 explicitly — today = through day
{
  const throughDay = 100
  const now = dayMs(100)
  const m = meta(throughDay)
  const result = indexStatus(m, now)
  assert.equal(result.state, 'ok', 'test 7: state should be ok when daysBehind=0')
  assert.equal(result.daysBehind, 0, 'test 7: daysBehind should be 0')
  console.log('PASS test 7: daysBehind=0 is ok')
}

// 8. exact text for a fixed nowMs — through = day 5 (2026-01-06), since = 5,
//    walletCount = 50599, nowMs = day 5 (same day → no behind, no gaps)
//    Expected: "Closed days 2026-01-06 to 2026-01-06, 50,599 wallets."
{
  // day 5 = 2026-01-06 UTC
  const throughDay = 5
  const nowMs = dayMs(5)
  const m = meta(throughDay, [], 50_599, 5)
  const result = indexStatus(m, nowMs)
  const expected = 'Closed days 2026-01-06 to 2026-01-06, 50,599 wallets.'
  assert.equal(result.text, expected, `test 8: text mismatch\n  got:      ${result.text}\n  expected: ${expected}`)
  console.log('PASS test 8: exact text match')
}

// 9. exact text with a multi-day range — since=5 (2026-01-06), through=283 (2026-10-11),
//    walletCount=50599, nowMs = through day (ok, no gaps)
//    Expected: "Closed days 2026-01-06 to 2026-10-11, 50,599 wallets."
{
  // day 283 from 2026-01-01: Jan has 31 days → 283-5=278 days after Jan 6
  // 2026-01-06 + 278 days = let's compute:
  //   EPOCH_MS = Date.UTC(2026,0,1)
  //   dayToDate(283) should be 2026-10-11 UTC
  //   dayToDate(5)   = 2026-01-06 UTC
  const throughDay = 283
  const nowMs = dayMs(283)
  const m = meta(throughDay, [], 50_599, 5)
  const result = indexStatus(m, nowMs)
  const expected = 'Closed days 2026-01-06 to 2026-10-11, 50,599 wallets.'
  assert.equal(result.text, expected, `test 9: text mismatch\n  got:      ${result.text}\n  expected: ${expected}`)
  console.log('PASS test 9: exact text match for multi-day range')
}

// 10. daysBehind clamped at 0 — nowMs is before through day (future index)
{
  const now = dayMs(5)             // today is day 5
  const m = meta(10)              // through = day 10 (future)
  const result = indexStatus(m, now)
  assert.equal(result.state, 'ok', 'test 10: future through treated as ok (daysBehind clamped to 0)')
  assert.equal(result.daysBehind, 0, 'test 10: daysBehind should be 0 when now < through')
  console.log('PASS test 10: daysBehind clamped to 0 for future through')
}

// 11. late in the UTC day still counts as that same day (floor, not round)
{
  const now = dayMs(10) + 20 * 3_600_000    // day 10 at 20:00 UTC
  const result = indexStatus(meta(8), now)
  assert.equal(result.daysBehind, 2, 'test 11: 20:00 UTC on day 10 is still day 10')
  assert.equal(result.state, 'ok', 'test 11: 2 days behind is still ok')
  console.log('PASS test 11: late-day time floors to the same UTC day')
}

console.log('\nAll 11 tests passed.')
