/**
 * Tests for the pure `lastNUtcDays` helper in useHourlyFiles.ts
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings src/hooks/useHourlyFiles.test.ts
 *
 * Uses node:assert/strict only.
 */
import assert from 'node:assert/strict'

// We can't import directly from the .ts file that has React Query imports in
// Node (no React runtime), so we duplicate the pure helper inline here for
// testing purposes.  The actual hook is tested via the browser (React Query).
// The helper is exported from the module for unit testing.

// Inline re-implementation — must stay byte-for-byte identical to the one in
// useHourlyFiles.ts.  If you change one, change the other.
function lastNUtcDays(n: number, nowMs: number): string[] {
  if (n <= 0) return []
  const ONE_DAY = 86_400_000
  const days: string[] = []
  const todayStart = Math.floor(nowMs / ONE_DAY) * ONE_DAY
  for (let i = n - 1; i >= 0; i--) {
    const t = todayStart - i * ONE_DAY
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    days.push(`${y}-${m}-${dd}`)
  }
  return days
}

// Anchor: 2026-10-13T12:34:56.789Z  (mid-day Tuesday — not at midnight)
const OCT_13_NOON = Date.UTC(2026, 9, 13, 12, 34, 56, 789)

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (e) {
    console.error(`  FAIL  ${name}`)
    console.error(`        ${(e as Error).message}`)
    failed++
  }
}

// ── n=0 / n<0 ─────────────────────────────────────────────────────────────────

test('n=0 → empty array', () => {
  assert.deepEqual(lastNUtcDays(0, OCT_13_NOON), [])
})

test('n=-1 → empty array', () => {
  assert.deepEqual(lastNUtcDays(-1, OCT_13_NOON), [])
})

// ── n=1 ───────────────────────────────────────────────────────────────────────

test('n=1 → returns only today', () => {
  const result = lastNUtcDays(1, OCT_13_NOON)
  assert.equal(result.length, 1)
  assert.equal(result[0], '2026-10-13')
})

test('n=1 at exactly midnight UTC → still today', () => {
  const midnight = Date.UTC(2026, 9, 13, 0, 0, 0, 0)
  assert.deepEqual(lastNUtcDays(1, midnight), ['2026-10-13'])
})

test('n=1 at one ms before midnight UTC → yesterday', () => {
  const beforeMidnight = Date.UTC(2026, 9, 13, 0, 0, 0, 0) - 1  // 2026-10-12T23:59:59.999Z
  assert.deepEqual(lastNUtcDays(1, beforeMidnight), ['2026-10-12'])
})

// ── n=8 ───────────────────────────────────────────────────────────────────────

test('n=8 → 8 days, oldest first, today last', () => {
  const result = lastNUtcDays(8, OCT_13_NOON)
  assert.equal(result.length, 8)
  assert.equal(result[0], '2026-10-06')
  assert.equal(result[7], '2026-10-13')
})

test('n=8 days are consecutive calendar days', () => {
  const result = lastNUtcDays(8, OCT_13_NOON)
  for (let i = 1; i < result.length; i++) {
    const prev = new Date(result[i - 1] + 'T00:00:00Z').getTime()
    const curr = new Date(result[i]     + 'T00:00:00Z').getTime()
    assert.equal(curr - prev, 86_400_000, `gap between ${result[i-1]} and ${result[i]} should be 1 day`)
  }
})

// ── UTC day boundary ──────────────────────────────────────────────────────────

test('UTC day boundary: n=2 just after midnight Oct 13 UTC → Oct 12 and Oct 13', () => {
  const justAfterMidnight = Date.UTC(2026, 9, 13, 0, 0, 0, 1)
  const result = lastNUtcDays(2, justAfterMidnight)
  assert.deepEqual(result, ['2026-10-12', '2026-10-13'])
})

test('UTC day boundary: n=2 just before midnight Oct 13 UTC → Oct 11 and Oct 12', () => {
  const justBeforeMidnight = Date.UTC(2026, 9, 13, 0, 0, 0, 0) - 1
  const result = lastNUtcDays(2, justBeforeMidnight)
  assert.deepEqual(result, ['2026-10-11', '2026-10-12'])
})

// ── Format ────────────────────────────────────────────────────────────────────

test('all entries match YYYY-MM-DD format', () => {
  const result = lastNUtcDays(8, OCT_13_NOON)
  for (const day of result) {
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/, `"${day}" does not match YYYY-MM-DD`)
  }
})

test('month boundary: Oct 1 n=3 → Sep 29, Sep 30, Oct 1', () => {
  const oct1 = Date.UTC(2026, 9, 1, 6, 0, 0, 0)
  assert.deepEqual(lastNUtcDays(3, oct1), ['2026-09-29', '2026-09-30', '2026-10-01'])
})

test('year boundary: Jan 1 n=3 → Dec 30, Dec 31, Jan 1', () => {
  const jan1 = Date.UTC(2027, 0, 1, 6, 0, 0, 0)
  assert.deepEqual(lastNUtcDays(3, jan1), ['2026-12-30', '2026-12-31', '2027-01-01'])
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log()
console.log(`useHourlyFiles/lastNUtcDays: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
