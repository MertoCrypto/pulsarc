/**
 * Unit tests for peakAndAverage() in src/lib/chainDaily.ts
 * (toDailyPoints is covered by a separate chainDaily.test.ts)
 *
 * Run from repo root:
 *   node --experimental-strip-types --no-warnings src/lib/chainDailyStats.test.ts
 */

import assert from 'node:assert/strict'
import { peakAndAverage } from './chainDaily.ts'

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0
let total = 0

function check<T>(label: string, actual: T, expected: T): void {
  total++
  try {
    assert.deepEqual(actual, expected)
    console.log(`  ✓ ${label}`)
    passed++
  } catch {
    console.error(`  ✗ ${label}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
  }
}

/** Floating-point near-equality (|a-b| < 1e-9). */
function near(label: string, actual: number, expected: number): void {
  total++
  if (Math.abs(actual - expected) < 1e-9) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    actual:   ${actual}`)
    console.error(`    expected: ${expected}`)
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function pts(...transactions: number[]) {
  return transactions.map(t => ({ transactions: t }))
}

// ---------------------------------------------------------------------------
// peakAndAverage
// ---------------------------------------------------------------------------

console.log('\n--- peakAndAverage: empty array ---')
{
  const r = peakAndAverage([])
  check('empty: peak = 0', r.peak, 0)
  check('empty: avg = 0',  r.avg,  0)
}

console.log('\n--- peakAndAverage: single point ---')
{
  const r = peakAndAverage(pts(42))
  check('single: peak = 42', r.peak, 42)
  near('single: avg = 42',   r.avg,  42)
}

console.log('\n--- peakAndAverage: peak is max ---')
{
  const r = peakAndAverage(pts(10, 20, 60))
  check('peak = 60', r.peak, 60)
  near('avg = 30', r.avg, 30)           // (10+20+60)/3 = 30
}

console.log('\n--- peakAndAverage: all zeros ---')
{
  const r = peakAndAverage(pts(0, 0, 0, 0))
  check('all-zero: peak = 0', r.peak, 0)
  near('all-zero: avg = 0',   r.avg,  0)
}

console.log('\n--- peakAndAverage: avg is arithmetic mean ---')
{
  // 1+2+3+4+5 = 15, /5 = 3
  const r = peakAndAverage(pts(1, 2, 3, 4, 5))
  check('peak = 5', r.peak, 5)
  near('avg = 3', r.avg, 3)
}

console.log('\n--- peakAndAverage: peak at beginning ---')
{
  const r = peakAndAverage(pts(100, 10, 20, 30))
  check('peak = 100 (first)', r.peak, 100)
  near('avg = 40', r.avg, (100 + 10 + 20 + 30) / 4)
}

console.log('\n--- peakAndAverage: peak at end ---')
{
  const r = peakAndAverage(pts(5, 10, 15, 999))
  check('peak = 999 (last)', r.peak, 999)
  near('avg = 257.25', r.avg, (5 + 10 + 15 + 999) / 4)
}

console.log('\n--- peakAndAverage: does not mutate input ---')
{
  const input = pts(30, 10, 50, 20)
  const originalValues = input.map(p => p.transactions)
  peakAndAverage(input)
  const afterValues = input.map(p => p.transactions)
  check('input array not mutated', afterValues, originalValues)
}

console.log('\n--- peakAndAverage: two equal peaks ---')
{
  const r = peakAndAverage(pts(7, 7, 3))
  check('equal peaks: peak = 7', r.peak, 7)
  near('equal peaks: avg = 17/3', r.avg, 17 / 3)
}

console.log('\n--- peakAndAverage: non-integer avg ---')
{
  // 1+2 = 3, /2 = 1.5
  const r = peakAndAverage(pts(1, 2))
  check('peak = 2', r.peak, 2)
  near('avg = 1.5', r.avg, 1.5)
}

console.log('\n--- peakAndAverage: large values ---')
{
  const r = peakAndAverage(pts(1_000_000, 2_000_000, 3_000_000))
  check('peak = 3_000_000', r.peak, 3_000_000)
  near('avg = 2_000_000', r.avg, 2_000_000)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nchainDailyStats.test.ts: ${passed}/${total} passed`)
if (passed < total) process.exit(1)
