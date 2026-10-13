/**
 * Tests for hourlyToDaily.
 *
 * Run:
 *   node --experimental-strip-types --no-warnings src/lib/hourlyToDaily.test.ts
 *
 * Behaviour pinned by these tests (cases document the contract):
 *  1. Single full day (24 hours 00-23) → partial:false
 *  2. Incomplete first day (first hour ≠ 00) → partial:true for that day only
 *  3. Incomplete last day (last hour ≠ 23) → partial:true for that day only
 *  4. Empty input → []
 *  5. Corrupted rows are skipped / treated as 0
 *  6. Out-of-order input → sorted oldest-to-newest output
 *  7. Duplicate hour → SUMMED (not deduped); both are counted
 *  8. Day boundary: last hour of day N and first hour of day N+1
 */

import assert from 'node:assert/strict'
import { hourlyToDaily } from './hourlyToDaily.ts'
import type { HourlyRow } from './hourlyToDaily.ts'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  console.log(`  ✓ ${name}`)
  passed++
}

// ── helpers ──────────────────────────────────────────────────────────────────

function row(hour: string, txs: number): HourlyRow {
  return { hour, txs }
}

/** Build all 24 hours for a day (00-23) each with `txs` transactions. */
function fullDay(day: string, txs: number): HourlyRow[] {
  return Array.from({ length: 24 }, (_, h) => row(`${day}T${String(h).padStart(2, '0')}`, txs))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Single full day (24 hours, 00 → 23)
// ─────────────────────────────────────────────────────────────────────────────
// A day with all 24 hours present — minH=0, maxH=23 → partial=false.
// txs = 10 per hour → total = 240.
console.log('\n1. Single full day')
{
  const input = fullDay('2026-01-15', 10)
  const out   = hourlyToDaily(input)

  test('single full day: returns exactly 1 bucket', () => {
    assert.equal(out.length, 1)
  })
  test('single full day: day is correct', () => {
    assert.equal(out[0].day, '2026-01-15')
  })
  test('single full day: txs summed (24 × 10 = 240)', () => {
    assert.equal(out[0].txs, 240)
  })
  test('single full day: partial = false', () => {
    assert.equal(out[0].partial, false)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Incomplete first day (first hour ≠ 00)
// ─────────────────────────────────────────────────────────────────────────────
// Hours 17-23 only → minH=17 ≠ 0 → partial=true.
// Second day is complete (00-23) → partial=false.
console.log('\n2. Incomplete first day')
{
  const day1rows: HourlyRow[] = Array.from({ length: 7 }, (_, i) =>
    row(`2026-02-01T${String(17 + i).padStart(2, '0')}`, 100), // T17..T23
  )
  const day2rows = fullDay('2026-02-02', 50)
  const out = hourlyToDaily([...day1rows, ...day2rows])

  test('incomplete first day: 2 buckets', () => {
    assert.equal(out.length, 2)
  })
  test('incomplete first day: day 1 partial = true (first hour is 17)', () => {
    assert.equal(out[0].day, '2026-02-01')
    assert.equal(out[0].partial, true)
  })
  test('incomplete first day: day 1 txs = 700 (7 hours × 100)', () => {
    assert.equal(out[0].txs, 700)
  })
  test('incomplete first day: day 2 partial = false (complete)', () => {
    assert.equal(out[1].day, '2026-02-02')
    assert.equal(out[1].partial, false)
  })
  test('incomplete first day: day 2 txs = 1200 (24 × 50)', () => {
    assert.equal(out[1].txs, 1200)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Incomplete last day (last hour ≠ 23)
// ─────────────────────────────────────────────────────────────────────────────
// First day complete, last day only hours 00-05 → maxH=5 ≠ 23 → partial=true.
console.log('\n3. Incomplete last day')
{
  const day1rows = fullDay('2026-03-10', 20)
  const day2rows: HourlyRow[] = Array.from({ length: 6 }, (_, i) =>
    row(`2026-03-11T${String(i).padStart(2, '0')}`, 30), // T00..T05
  )
  const out = hourlyToDaily([...day1rows, ...day2rows])

  test('incomplete last day: 2 buckets', () => {
    assert.equal(out.length, 2)
  })
  test('incomplete last day: day 1 partial = false', () => {
    assert.equal(out[0].partial, false)
  })
  test('incomplete last day: day 2 partial = true (last hour is 05)', () => {
    assert.equal(out[1].day, '2026-03-11')
    assert.equal(out[1].partial, true)
  })
  test('incomplete last day: day 2 txs = 180 (6 × 30)', () => {
    assert.equal(out[1].txs, 180)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Empty input
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. Empty input')
{
  test('empty input returns []', () => {
    assert.deepEqual(hourlyToDaily([]), [])
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Corrupted rows — skipped or counted as 0
// ─────────────────────────────────────────────────────────────────────────────
// • hour too short (< 13 chars): skipped entirely
// • hour with invalid hour component ("XX"): skipped
// • hour outside 0-23: skipped
// • txs = NaN: treated as 0 (the hour still registers for min/max tracking)
// • txs = -5: treated as 0
// • txs = Infinity: treated as 0
// • A valid row in the same day confirms the day itself appears
console.log('\n5. Corrupted rows')
{
  const good   = row('2026-04-01T12', 50)  // valid reference point
  const short  = { hour: '2026-04-01',    txs: 999 }  // hour too short — skipped
  const badH   = { hour: '2026-04-01TXX', txs: 999 }  // NaN hour — skipped
  const outRange = { hour: '2026-04-01T25', txs: 999 } // hour 25 — skipped
  const nanTx  = row('2026-04-01T05', NaN)             // txs=NaN → 0
  const negTx  = row('2026-04-01T06', -5)              // txs<0   → 0
  const infTx  = row('2026-04-01T07', Infinity)        // txs=Inf → 0
  // non-numeric txs string cast
  const strTx  = { hour: '2026-04-01T08', txs: 'bad' as unknown as number } // → 0

  const out = hourlyToDaily([good, short, badH, outRange, nanTx, negTx, infTx, strTx])

  test('corrupted rows: exactly 1 day bucket (bad rows skipped)', () => {
    assert.equal(out.length, 1)
    assert.equal(out[0].day, '2026-04-01')
  })
  test('corrupted rows: only good txs counted (50 from T12 only)', () => {
    // nanTx/negTx/infTx/strTx contribute 0; good contributes 50
    assert.equal(out[0].txs, 50)
  })
  // nanTx registered at T05, negTx at T06, infTx at T07, strTx at T08:
  // these still extend minH from 12 down to 5 (and all < 12), but the bad rows
  // are NOT skipped for min/max tracking — they are kept as 0-tx rows.
  // Therefore minH=5 ≠ 0 → partial=true.
  // (This is a deliberate contract choice: a zero-tx row in an incomplete position
  //  still marks the day as partial, because it proves that hour existed but
  //  had no transactions — which is different from "we have no data before T05".)
  test('corrupted rows: zero-tx rows still extend min/max → partial=true (minH=5)', () => {
    assert.equal(out[0].partial, true)
  })
  // All-bad-row input: skipped rows → empty output
  test('corrupted rows: all-bad input → []', () => {
    const allBad = [short, badH, outRange]
    assert.deepEqual(hourlyToDaily(allBad as HourlyRow[]), [])
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Out-of-order input → output sorted oldest-to-newest
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6. Out-of-order input')
{
  // Deliberately interleave three days
  const input: HourlyRow[] = [
    row('2026-05-03T00', 1), row('2026-05-03T23', 2),  // day 3
    row('2026-05-01T00', 10), row('2026-05-01T23', 10), // day 1
    row('2026-05-02T00', 5), row('2026-05-02T23', 5),   // day 2
  ]
  const out = hourlyToDaily(input)

  test('out-of-order: 3 buckets', () => {
    assert.equal(out.length, 3)
  })
  test('out-of-order: sorted ascending', () => {
    assert.equal(out[0].day, '2026-05-01')
    assert.equal(out[1].day, '2026-05-02')
    assert.equal(out[2].day, '2026-05-03')
  })
  test('out-of-order: txs correct per day', () => {
    assert.equal(out[0].txs, 20)  // 10+10
    assert.equal(out[1].txs, 10)  // 5+5
    assert.equal(out[2].txs, 3)   // 1+2
  })
  // All days: minH=0, maxH=23 → partial=false for all
  // EXCEPT day 3 which is the last day and maxH=23 → NOT partial
  // AND day 1 which is the first day and minH=0 → NOT partial
  test('out-of-order: all days with 00+23 are non-partial', () => {
    assert.equal(out[0].partial, false)
    assert.equal(out[1].partial, false)
    assert.equal(out[2].partial, false)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Duplicate hour string → SUMMED (both counted)
// ─────────────────────────────────────────────────────────────────────────────
// Contract: if the same hour string appears twice, both txs values are added.
// This is the intentional behaviour we pin here.
console.log('\n7. Duplicate hour → summed')
{
  const input: HourlyRow[] = [
    row('2026-06-15T10', 100),
    row('2026-06-15T10', 200), // duplicate hour
    row('2026-06-15T00', 50),  // gives minH=0
    row('2026-06-15T23', 50),  // gives maxH=23
  ]
  const out = hourlyToDaily(input)

  test('duplicate hour: 1 bucket', () => {
    assert.equal(out.length, 1)
  })
  // 100 + 200 + 50 + 50 = 400
  test('duplicate hour: txs summed (100 + 200 + 50 + 50 = 400)', () => {
    assert.equal(out[0].txs, 400)
  })
  test('duplicate hour: partial=false (minH=0, maxH=23)', () => {
    assert.equal(out[0].partial, false)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Day boundary: last hour of day N and first hour of day N+1
// ─────────────────────────────────────────────────────────────────────────────
// Verifies that "YYYY-MM-DDTHH".slice(0,10) correctly separates adjacent days.
console.log('\n8. Day boundary')
{
  const input: HourlyRow[] = [
    row('2026-07-31T23', 300),  // last hour of July 31
    row('2026-08-01T00', 400),  // first hour of August 1
  ]
  const out = hourlyToDaily(input)

  test('day boundary: 2 separate buckets', () => {
    assert.equal(out.length, 2)
  })
  test('day boundary: correct days', () => {
    assert.equal(out[0].day, '2026-07-31')
    assert.equal(out[1].day, '2026-08-01')
  })
  test('day boundary: txs not mixed', () => {
    assert.equal(out[0].txs, 300)
    assert.equal(out[1].txs, 400)
  })
  // day 0: only T23 → minH=maxH=23; first day, minH ≠ 0 → partial=true
  // day 1: only T00 → minH=maxH=0;  last day,  maxH ≠ 23 → partial=true
  test('day boundary: both single-hour days are partial', () => {
    assert.equal(out[0].partial, true)
    assert.equal(out[1].partial, true)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Single-day that is BOTH first and last: partial when any edge is missing
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n9. Single-day first+last edge')
{
  // Only hours 05-18 → minH=5, maxH=18; it is both first and last day
  // → partial=true (both conditions fire, but one is enough)
  const input: HourlyRow[] = Array.from({ length: 14 }, (_, i) =>
    row(`2026-09-10T${String(5 + i).padStart(2, '0')}`, 10),
  )
  const out = hourlyToDaily(input)
  test('single-day first+last: partial=true when neither 00 nor 23 is present', () => {
    assert.equal(out.length, 1)
    assert.equal(out[0].partial, true)
  })

  // Only hour 00 (minH=0, maxH=0): it is both first and last day.
  // First-day check: minH=0 → OK.  Last-day check: maxH=0 ≠ 23 → partial=true.
  const onlyMidnight = hourlyToDaily([row('2026-09-11T00', 5)])
  test('single-day first+last only T00: partial=true (maxH ≠ 23)', () => {
    assert.equal(onlyMidnight[0].partial, true)
  })

  // Only hour 23 (minH=23, maxH=23): first-day check: minH=23 ≠ 0 → partial=true.
  const onlyMidnight23 = hourlyToDaily([row('2026-09-12T23', 5)])
  test('single-day first+last only T23: partial=true (minH ≠ 0)', () => {
    assert.equal(onlyMidnight23[0].partial, true)
  })

  // All 24 hours present on a single day → partial=false
  const full = hourlyToDaily(fullDay('2026-09-13', 1))
  test('single-day first+last all 24 hours: partial=false', () => {
    assert.equal(full[0].partial, false)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Realistic excerpt from mainnet-latest.json
// ─────────────────────────────────────────────────────────────────────────────
// First series entry: 2026-10-07T17 → partial first day
// Last series entry:  2026-10-13T18 → partial last day
// Middle days (2026-10-10, 2026-10-11, 2026-10-12) span full 24 h → not partial
// (This also exercises the tx aggregation path end-to-end)
console.log('\n10. Realistic excerpt from mainnet series')
{
  // Minimal reproduction of the actual boundary conditions:
  // Day 2026-10-07: hours 17-23 only (7 hours) → partial first
  // Day 2026-10-08: hours 00-04 then gap; 09 onward — simulating the real data
  //   which has 00-04 then jumps to 09 (gap in middle = fine, still 00..last=04 covered)
  // For the partial test, what matters is the REAL min/max hour in our data.
  // We'll use a simplified 3-day subset: partial first, full middle, partial last.

  const day1: HourlyRow[] = Array.from({ length: 7 }, (_, i) =>
    row(`2026-10-07T${String(17 + i).padStart(2, '0')}`, 10_000),
  ) // T17..T23, txs = 70_000 total

  const day2: HourlyRow[] = fullDay('2026-10-08', 30_000) // 720_000 total

  const day3: HourlyRow[] = [row('2026-10-09T00', 5_000), row('2026-10-09T18', 5_000)]
  // T00 and T18 only → last hour = 18 ≠ 23 → partial

  const out = hourlyToDaily([...day1, ...day2, ...day3])

  test('realistic: 3 days produced', () => {
    assert.equal(out.length, 3)
  })
  test('realistic: first day partial (T17 = first hour)', () => {
    assert.equal(out[0].day, '2026-10-07')
    assert.equal(out[0].partial, true)
    assert.equal(out[0].txs, 70_000)
  })
  test('realistic: middle day not partial', () => {
    assert.equal(out[1].day, '2026-10-08')
    assert.equal(out[1].partial, false)
    assert.equal(out[1].txs, 720_000)
  })
  test('realistic: last day partial (T18 = last hour)', () => {
    assert.equal(out[2].day, '2026-10-09')
    assert.equal(out[2].partial, true)
    assert.equal(out[2].txs, 10_000)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

// ── Survivor-killing cases: hour string boundaries, 24 is invalid, negative txs counts as 0, non-string hour ──
{
  const r = hourlyToDaily([
    { hour: '2026-10-07T00', txs: 1 },
    { hour: '2026-10-07T24', txs: 100 },          // hour 24 does not exist -> skipped
    { hour: '2026-10-07T2', txs: 100 },           // too short -> skipped
    { hour: '2026-10-07T23', txs: -5 },           // negative -> counted as 0
    { hour: 12345 as unknown as string, txs: 100 }, // not a string -> skipped
  ])
  assert.deepEqual(r, [{ day: '2026-10-07', txs: 1, partial: false }])
}
{
  // negative must not turn into a positive count, and exactly-zero txs is kept as 0
  const r = hourlyToDaily([{ hour: '2026-10-07T00', txs: 0 }, { hour: '2026-10-07T23', txs: 7 }])
  assert.equal(r[0].txs, 7)
}
console.log('survivor-killing cases passed')
console.log(`\n✓ All ${passed} assertions passed.`)
