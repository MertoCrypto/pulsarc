// run: node --experimental-strip-types --no-warnings src/lib/chainDaily.test.ts

import assert from 'node:assert/strict'
import { toDailyPoints, type DailyPoint, type RawDaily } from './chainDaily.ts'

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------
let passed = 0
let total = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    passed++
  } catch (err) {
    const e = err as { message?: string }
    console.error(`  FAIL  ${label}`)
    console.error(`        ${e.message ?? String(err)}`)
  }
}

console.log('\n=== chainDaily / toDailyPoints ===\n')

// ---------------------------------------------------------------------------
// 1. Label formatting – leading zeros dropped
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = {
    chart_data: [
      { date: '2026-01-05', transactions_count: 1 },
      { date: '2026-12-31', transactions_count: 2 },
    ],
  }
  const pts = toDailyPoints(raw)
  check('1/5 label (leading zero dropped)', pts[0].label, '1/5')
  check('12/31 label', pts[1].label, '12/31')
}

// ---------------------------------------------------------------------------
// 2. date and transactions copied through unchanged
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = {
    chart_data: [{ date: '2026-03-15', transactions_count: 42 }],
  }
  const pts = toDailyPoints(raw)
  check('date copied through', pts[0].date, '2026-03-15')
  check('transactions copied through', pts[0].transactions, 42)
}

// ---------------------------------------------------------------------------
// 3. Output sorted ascending by date string even when input is reversed
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = {
    chart_data: [
      { date: '2026-03-03', transactions_count: 3 },
      { date: '2026-03-01', transactions_count: 1 },
      { date: '2026-03-02', transactions_count: 2 },
    ],
  }
  const pts = toDailyPoints(raw)
  const dates = pts.map((p: DailyPoint) => p.date)
  check('reversed input -> sorted ascending dates', dates, ['2026-03-01', '2026-03-02', '2026-03-03'])
}

// ---------------------------------------------------------------------------
// 4. Already sorted input stays sorted
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = {
    chart_data: [
      { date: '2026-06-01', transactions_count: 10 },
      { date: '2026-06-02', transactions_count: 20 },
    ],
  }
  const pts = toDailyPoints(raw)
  check('already sorted input stays sorted', pts.map((p: DailyPoint) => p.date), ['2026-06-01', '2026-06-02'])
}

// ---------------------------------------------------------------------------
// 5. Empty chart_data -> []
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = { chart_data: [] }
  check('empty chart_data -> []', toDailyPoints(raw), [])
}

// ---------------------------------------------------------------------------
// 6. Duplicate dates – both entries kept (stable, order by date then original)
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = {
    chart_data: [
      { date: '2026-05-01', transactions_count: 7 },
      { date: '2026-05-01', transactions_count: 8 },
    ],
  }
  const pts = toDailyPoints(raw)
  check('duplicate dates: both kept (length 2)', pts.length, 2)
  check('duplicate dates: first transactions value', pts[0].transactions, 7)
  check('duplicate dates: second transactions value', pts[1].transactions, 8)
}

// ---------------------------------------------------------------------------
// 7. transactions_count of 0 is kept (not filtered out)
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = {
    chart_data: [{ date: '2026-07-04', transactions_count: 0 }],
  }
  const pts = toDailyPoints(raw)
  check('transactions 0 kept (length 1)', pts.length, 1)
  check('transactions 0 value preserved', pts[0].transactions, 0)
}

// ---------------------------------------------------------------------------
// 8. Year boundary ordering ('2025-12-31' before '2026-01-01')
// ---------------------------------------------------------------------------
{
  const raw: RawDaily = {
    chart_data: [
      { date: '2026-01-01', transactions_count: 100 },
      { date: '2025-12-31', transactions_count: 99 },
    ],
  }
  const pts = toDailyPoints(raw)
  check('year boundary: 2025-12-31 before 2026-01-01', pts[0].date, '2025-12-31')
  check('year boundary: 2026-01-01 second', pts[1].date, '2026-01-01')
}

// ---------------------------------------------------------------------------
// 9. Does not mutate the input array
// ---------------------------------------------------------------------------
{
  const inputRows = [
    { date: '2026-09-03', transactions_count: 5 },
    { date: '2026-09-01', transactions_count: 3 },
    { date: '2026-09-02', transactions_count: 4 },
  ]
  const raw: RawDaily = { chart_data: inputRows }
  // deep copy before calling
  const before = inputRows.map(r => ({ ...r }))
  toDailyPoints(raw)
  // compare each element of the original array
  const mutated: boolean = inputRows.some(
    (r, i) => r.date !== before[i].date || r.transactions_count !== before[i].transactions_count,
  )
  check('does not mutate input array', mutated, false)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed}/${total} tests passed\n`)
if (passed < total) process.exit(1)
