/**
 * Unit tests for src/lib/health.ts
 *
 * Run from repo root:
 *   node --experimental-strip-types --no-warnings src/lib/health.test.ts
 */

import assert from 'node:assert/strict'
import { computeHealth, healthLabel } from './health.ts'
import type { AppMetrics, HistoryPoint } from '@/lib/appActivity'

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
// Helpers to build minimal metric / history objects
// ---------------------------------------------------------------------------

/** Build the minimal AppMetrics shape the function needs. */
function m(txCount: number, activeWallets: number): AppMetrics {
  return { txCount, activeWallets } as unknown as AppMetrics
}

/** Build a minimal HistoryPoint array from txCount values. */
function h(...txCounts: number[]): HistoryPoint[] {
  return txCounts.map(txCount => ({ txCount }) as never)
}

// ---------------------------------------------------------------------------
// activity = min(40, 8 * log10(1 + txCount))
// ---------------------------------------------------------------------------

console.log('\n--- activity component ---')

near('txCount 0  -> activity 0',
  computeHealth(m(0, 0), []).parts.activity,
  0)

near('txCount 9  -> activity 8  (8*log10(10))',
  computeHealth(m(9, 0), []).parts.activity,
  8)

near('txCount 99 -> activity 16 (8*log10(100))',
  computeHealth(m(99, 0), []).parts.activity,
  16)

near('txCount 99999 -> activity 40 (cap, 8*5=40)',
  computeHealth(m(99999, 0), []).parts.activity,
  40)

near('txCount 10_000_000 -> activity still 40 (capped)',
  computeHealth(m(10_000_000, 0), []).parts.activity,
  40)

// ---------------------------------------------------------------------------
// breadth = txCount>0 ? min(30, activeWallets/txCount * 90) : 0
// ---------------------------------------------------------------------------

console.log('\n--- breadth component ---')

near('0 tx, 5 wallets -> breadth 0 (no tx guard)',
  computeHealth(m(0, 5), []).parts.breadth,
  0)

near('10 tx, 1 wallet -> breadth 9  (1/10*90)',
  computeHealth(m(10, 1), []).parts.breadth,
  9)

near('10 tx, 10 wallets -> breadth 30 (capped from 90)',
  computeHealth(m(10, 10), []).parts.breadth,
  30)

near('5 tx, 100 wallets -> breadth 30 (wallets>tx still capped)',
  computeHealth(m(5, 100), []).parts.breadth,
  30)

// ---------------------------------------------------------------------------
// consistency = history.length ? (active / history.length) * 30 : 0
// ---------------------------------------------------------------------------

console.log('\n--- consistency component ---')

near('empty history -> consistency 0',
  computeHealth(m(1, 1), []).parts.consistency,
  0)

near('3 of 4 slices active -> consistency 22.5',
  computeHealth(m(1, 1), h(10, 0, 5, 3)).parts.consistency,
  22.5)

near('all 4 slices active -> consistency 30',
  computeHealth(m(1, 1), h(1, 2, 3, 4)).parts.consistency,
  30)

near('none active -> consistency 0',
  computeHealth(m(1, 1), h(0, 0, 0, 0)).parts.consistency,
  0)

near('1 of 1 slices active -> consistency 30',
  computeHealth(m(1, 1), h(1)).parts.consistency,
  30)

// ---------------------------------------------------------------------------
// score = Math.round(activity + breadth + consistency)
// ---------------------------------------------------------------------------

console.log('\n--- score rounding ---')

// Construct a case where sum = 56.5 -> score 57
// activity=40 (txCount>=99999), breadth=30 (capped), consistency=?
// consistency = (active/len)*30; need consistency=56.5-70 = no, pick different parts
// activity=8 (txCount=9), breadth=9 (10tx,1wallet), consistency=22.5 (3/4) => sum=39.5 -> 40
// activity=16 (txCount=99), breadth=9 (10tx,1wallet), consistency=?
// For sum=56.5: 16+9=25, need consistency=31.5 -> impossible (max 30)
// Use: activity=8, breadth=20 (20/30*30... wallets=20/30? no: 2wallets/9tx*90=20)
//      => activity=8, breadth=20, consistency=22.5 => sum=50.5 -> 51
{
  const r1 = computeHealth(m(9, 2), h(10, 0, 5, 3))
  near('activity=8, breadth=20, consistency=22.5 -> sum=50.5 -> score 51',
    r1.score, 51)
  near('parts are unrounded (activity exact)', r1.parts.activity, 8)
  near('parts are unrounded (consistency exact)', r1.parts.consistency, 22.5)
}

// activity=16 (txCount=99), breadth=9 (1wallet/10tx *90=9 — use separate metric set)
// For a clean floor case: activity=16(tx=99), breadth=9(tx=10,wallets=1 — different object),
// but both use the same metrics arg. So pick one object:
// tx=99, wallets=1 => breadth=1/99*90=0.909...; tx=10, wallets=1 => activity=min(40,8*log10(11))=8.34
// Cleanest: drive rounding purely via consistency fractional part.
// activity=16(tx=99), breadth=0 (wallets=0, tx=99>0: breadth=0/99*90=0), consistency=(3/8)*30=11.25
// sum = 16+0+11.25 = 27.25 -> score 27
{
  const r2 = computeHealth(m(99, 0), h(1, 0, 0, 0, 0, 1, 0, 1))
  const expectedSum = 16 + 0 + 11.25
  near('sum=27.25 -> score 27 (floor via Math.round)', r2.score, Math.round(expectedSum))
}

// sum=14.5: activity=0, breadth=0, consistency=(29/60)*30=14.5 -> score 15 (Math.round(14.5)=15 in JS)
{
  const r3 = computeHealth(m(0, 0), h(...Array.from({length: 60}, (_, i) => i < 29 ? 1 : 0)))
  near('sum=14.5 -> score 15 (Math.round)', r3.score, 15)
}

console.log('\n--- max score ---')

near('max score is 100: txCount=99999, wallets=99999, all history active',
  computeHealth(m(99999, 99999), h(1,1,1,1,1,1,1,1,1,1)).score,
  100)

// ---------------------------------------------------------------------------
// healthLabel
// ---------------------------------------------------------------------------

console.log('\n--- healthLabel ---')

check('score 70 -> Strong',   healthLabel(70),  'Strong')
check('score 100 -> Strong',  healthLabel(100), 'Strong')
check('score 71 -> Strong',   healthLabel(71),  'Strong')
check('score 69 -> Steady',   healthLabel(69),  'Steady')
check('score 40 -> Steady',   healthLabel(40),  'Steady')
check('score 39 -> Quiet',    healthLabel(39),  'Quiet')
check('score 0  -> Quiet',    healthLabel(0),   'Quiet')
check('score 1  -> Quiet',    healthLabel(1),   'Quiet')

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nhealth.test.ts: ${passed}/${total} passed`)
if (passed < total) process.exit(1)
