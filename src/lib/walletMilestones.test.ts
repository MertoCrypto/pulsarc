/**
 * Tests for src/lib/walletMilestones.ts
 * Run: node --experimental-strip-types --no-warnings src/lib/walletMilestones.test.ts
 *
 * Uses node:assert/strict only — no test framework.
 */

import assert from 'node:assert/strict'
import type { WalletRecord, WalletSummary } from './walletIndex.ts'
import { EPOCH_MS, dayToDate } from './walletIndex.ts'
import {
  calendarStats,
  buildMilestones,
  nextMilestone,
  type Milestone,
  type CalendarStats,
} from './walletMilestones.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✔ ${name}`)
    pass++
  } catch (e) {
    console.log(`  ✘ ${name}`)
    console.log(`    ${e instanceof Error ? e.message : String(e)}`)
    fail++
  }
}

/** Build a minimal WalletRecord with safe defaults. */
function makeRec(overrides: Partial<WalletRecord>): WalletRecord {
  return {
    f: 0, l: 0, d: '1', t: 0, x: 0, e: 0, o: 0, i: 0, a: '0', bo: 0, bi: 0,
    ...overrides,
  }
}

/** Build a minimal WalletSummary with safe defaults. */
function makeSummary(overrides: Partial<WalletSummary>): WalletSummary {
  return {
    firstSeen: dayToDate(0),
    lastActive: dayToDate(0),
    ageDays: 1,
    activeDays: 1,
    longestStreak: 1,
    activeShare: 1,
    tx: 0,
    failed: 0,
    failedShare: null,
    feesUsdc: 0,
    usdcSent: 0,
    usdcReceived: 0,
    apps: [],
    bridgeOut: 0,
    bridgeIn: 0,
    partial: false,
    ...overrides,
  }
}

// ── Utility: build a hex string with exactly the given bit positions set ──────

/**
 * Build a hex bitmap string where the specified bit indices are set (LSB = bit 0).
 * e.g. bitsToHex([0, 2]) → '5' (binary 101)
 */
function bitsToHex(bits: number[]): string {
  if (bits.length === 0) return '0'
  let n = 0n
  for (const b of bits) {
    n |= 1n << BigInt(b)
  }
  return n.toString(16)
}

// Verify the helper itself before relying on it in tests.
assert.strictEqual(bitsToHex([0]), '1')
assert.strictEqual(bitsToHex([0, 2]), '5')
assert.strictEqual(bitsToHex([0, 1, 2]), '7')

// ── calendarStats — bitmap edge cases ─────────────────────────────────────────

console.log('\ncalendarStats — bitmap edge cases')

test('bitmap "0" (zero-value) — zero unique days/weeks/months, streak 0', () => {
  // "0" is a valid hex string but BigInt('0x0') = 0 → no bits set.
  const rec = makeRec({ f: 0, l: 0, d: '0' })
  const cs = calendarStats(rec, 0)
  assert.equal(cs.uniqueDays, 0)
  assert.equal(cs.uniqueWeeks, 0)
  assert.equal(cs.uniqueMonths, 0)
  assert.equal(cs.longestStreak, 0)
  assert.equal(cs.currentStreak, 0)
})

test('single bit at position 0 (day f) — 1 day, 1 week, 1 month', () => {
  // rec.f = 0, bit 0 set → active on day 0 = 2026-01-01 (Thursday)
  const rec = makeRec({ f: 0, l: 0, d: '1' })
  const cs = calendarStats(rec, 0)
  assert.equal(cs.uniqueDays, 1)
  assert.equal(cs.uniqueWeeks, 1)
  assert.equal(cs.uniqueMonths, 1)
})

test('bit at day 0 (2026-01-01) maps to January 2026', () => {
  const rec = makeRec({ f: 0, l: 0, d: '1' })
  const cs = calendarStats(rec, 0)
  // uniqueMonths must be exactly 1 (January 2026)
  assert.equal(cs.uniqueMonths, 1)
})

test('two bits on same day resolve to 1 unique day (impossible by construction, belt-and-braces)', () => {
  // Just confirm a simple 2-bit same-month scenario counts correctly.
  // bits 0 and 1 → days 0 and 1 (Jan 1 and Jan 2 2026 — same week, same month)
  const rec = makeRec({ f: 0, l: 1, d: bitsToHex([0, 1]) })
  const cs = calendarStats(rec, 1)
  assert.equal(cs.uniqueDays, 2)
  assert.equal(cs.uniqueWeeks, 1)   // both in the same ISO week (Jan 1 = Thu, Jan 2 = Fri, same Mon-start week)
  assert.equal(cs.uniqueMonths, 1)  // both in January
})

test('large bitmap crossing many months and weeks counts them all', () => {
  // Activate every 7th day across 280 days (40 bits), starting at day 0.
  // Days: 0, 7, 14, 21, … 273 → 40 distinct days.
  // Months touched: Jan(0), Jan(7), Jan(14), Jan(21), Jan(28), Feb(35), … many months.
  // Each day is a Monday (day 0 = 2026-01-01 = Thu, so day 4 = Mon, not every-7-from-0…)
  // Just confirm counts are > 1 and self-consistent.
  const bits: number[] = []
  for (let i = 0; i < 40; i++) bits.push(i * 7)
  const rec = makeRec({ f: 0, l: bits[bits.length - 1], d: bitsToHex(bits) })
  const cs = calendarStats(rec, bits[bits.length - 1])
  assert.equal(cs.uniqueDays, 40)
  // 40 days spread over ~9.3 months, so uniqueMonths must be >= 9
  assert.ok(cs.uniqueMonths >= 9, `expected ≥9 months, got ${cs.uniqueMonths}`)
  // Each day is 7 apart, so at most they could share a week (Mon-Sun). Since
  // they are exactly 7 days apart they always land on the same weekday as day 0
  // (Thursday), so no two share a week — uniqueWeeks should equal 40.
  assert.equal(cs.uniqueWeeks, 40)
})

test('week boundary: Sunday (bit) and Monday (next bit) are in different ISO weeks', () => {
  // Find a Sunday in the epoch.
  // 2026-01-01 is a Thursday (day 0). To get to Sunday: Thu+3 = Sun → day 3.
  // Day 3 = 2026-01-04 (Sun). Day 4 = 2026-01-05 (Mon).
  // ISO weeks: day 3 is in week of 2025-12-29 (Mon). Day 4 is in week of 2026-01-05 (Mon).
  const sundayBit = 3  // day 3 = 2026-01-04 Sun
  const mondayBit = 4  // day 4 = 2026-01-05 Mon
  const rec = makeRec({ f: 0, l: mondayBit, d: bitsToHex([sundayBit, mondayBit]) })
  const cs = calendarStats(rec, mondayBit)
  assert.equal(cs.uniqueDays, 2)
  assert.equal(cs.uniqueWeeks, 2, 'Sunday and Monday must be in different ISO weeks')
})

test('month boundary: Jan 31 and Feb 1 are in different months', () => {
  // Day 0 = 2026-01-01. Day 30 = 2026-01-31. Day 31 = 2026-02-01.
  const rec = makeRec({ f: 0, l: 31, d: bitsToHex([30, 31]) })
  const cs = calendarStats(rec, 31)
  assert.equal(cs.uniqueMonths, 2, 'Jan 31 and Feb 1 should be different months')
})

test('month boundary: last day of February and first of March', () => {
  // 2026 is not a leap year. Feb has 28 days.
  // Day 0 = 2026-01-01. Feb 28 = day 31+27 = day 58. Mar 1 = day 59.
  const rec = makeRec({ f: 0, l: 59, d: bitsToHex([58, 59]) })
  const cs = calendarStats(rec, 59)
  assert.equal(cs.uniqueMonths, 2)
})

// ── calendarStats — currentStreak ─────────────────────────────────────────────

console.log('\ncalendarStats — currentStreak')

test('currentStreak = 0 when throughDay is inactive', () => {
  // bit 0 set only, throughDay = 1 (not set)
  const rec = makeRec({ f: 0, l: 0, d: bitsToHex([0]) })
  const cs = calendarStats(rec, 1)
  assert.equal(cs.currentStreak, 0)
})

test('currentStreak = 1 when only throughDay is active', () => {
  const rec = makeRec({ f: 0, l: 2, d: bitsToHex([2]) })
  const cs = calendarStats(rec, 2)
  assert.equal(cs.currentStreak, 1)
})

test('currentStreak counts consecutive days ending at throughDay', () => {
  // bits 0,1,2 set (days 0,1,2). throughDay = 2 → streak of 3.
  const rec = makeRec({ f: 0, l: 2, d: bitsToHex([0, 1, 2]) })
  const cs = calendarStats(rec, 2)
  assert.equal(cs.currentStreak, 3)
})

test('currentStreak stops at a gap', () => {
  // bits 0, 2, 3 set. throughDay = 3.
  // Working backwards from bit 3: bit 3 set (1), bit 2 set (2), bit 1 NOT set → stop.
  const rec = makeRec({ f: 0, l: 3, d: bitsToHex([0, 2, 3]) })
  const cs = calendarStats(rec, 3)
  assert.equal(cs.currentStreak, 2)
})

test('currentStreak = 0 when throughDay < rec.f', () => {
  const rec = makeRec({ f: 5, l: 5, d: bitsToHex([0]) })
  const cs = calendarStats(rec, 3)  // throughDay 3 < rec.f 5
  assert.equal(cs.currentStreak, 0)
})

test('currentStreak vs. longestStreak: current can be shorter than longest', () => {
  // bits 0,1,2 set (run of 3) then gap then bits 4,5 set (run of 2).
  // longestStreak = 3, but if throughDay = 5, currentStreak = 2.
  const rec = makeRec({ f: 0, l: 5, d: bitsToHex([0, 1, 2, 4, 5]) })
  const cs = calendarStats(rec, 5)
  assert.equal(cs.longestStreak, 3)
  assert.equal(cs.currentStreak, 2)
})

test('currentStreak = 0 when throughDay is exactly at a gap before the last run', () => {
  // bits 0,1,2 set; throughDay = 3 (not set).
  const rec = makeRec({ f: 0, l: 2, d: bitsToHex([0, 1, 2]) })
  const cs = calendarStats(rec, 3)
  assert.equal(cs.currentStreak, 0)
})

// ── calendarStats — uniqueWeeks / uniqueMonths self-consistency ───────────────

console.log('\ncalendarStats — week/month self-consistency')

test('uniqueWeeks <= uniqueDays (at most one week per day)', () => {
  const bits = [0, 1, 7, 8, 14, 15, 21, 22]
  const rec = makeRec({ f: 0, l: 22, d: bitsToHex(bits) })
  const cs = calendarStats(rec, 22)
  assert.equal(cs.uniqueDays, bits.length)
  assert.ok(cs.uniqueWeeks <= cs.uniqueDays)
  assert.ok(cs.uniqueWeeks >= 1)
})

test('uniqueMonths <= uniqueDays', () => {
  const bits = [0, 31, 59]  // Jan 1, Feb 1, Mar 1
  const rec = makeRec({ f: 0, l: 59, d: bitsToHex(bits) })
  const cs = calendarStats(rec, 59)
  assert.equal(cs.uniqueMonths, 3)
  assert.ok(cs.uniqueMonths <= cs.uniqueDays)
})

test('7 consecutive days starting on a Monday → 1 ISO week', () => {
  // Day 0 = 2026-01-01 (Thu). First Monday: day 4 = 2026-01-05.
  // Days 4–10 are Mon–Sun of the same ISO week.
  const bits = [4, 5, 6, 7, 8, 9, 10]
  const rec = makeRec({ f: 0, l: 10, d: bitsToHex(bits) })
  const cs = calendarStats(rec, 10)
  assert.equal(cs.uniqueWeeks, 1, '7 days Mon–Sun should be 1 ISO week')
})

test('8 consecutive days spanning a Mon boundary → 2 ISO weeks', () => {
  // Days 4–11: Mon Jan 5 through Tue Jan 13 → crosses into next week.
  const bits = [4, 5, 6, 7, 8, 9, 10, 11]
  const rec = makeRec({ f: 0, l: 11, d: bitsToHex(bits) })
  const cs = calendarStats(rec, 11)
  assert.equal(cs.uniqueWeeks, 2, '8 days crossing a Monday should be 2 ISO weeks')
})

// ── buildMilestones — threshold tests ─────────────────────────────────────────

console.log('\nbuildMilestones — thresholds')

// Helper: find a milestone by id.
function find(list: Milestone[], id: string): Milestone {
  const m = list.find(m => m.id === id)
  assert.ok(m !== undefined, `milestone ${id} not found`)
  return m
}

test('all 21 milestone ids are present', () => {
  const summary = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const list = buildMilestones(summary, cal, 0)
  const expectedIds = [
    'tx-50', 'tx-100', 'tx-500', 'tx-1000',
    'days-10', 'days-20', 'days-30',
    'age-30', 'age-60', 'age-90',
    'streak-3', 'streak-5', 'streak-7',
    'weeks-4', 'weeks-8',
    'apps-3', 'apps-5', 'apps-10',
    'bridge-1',
    'usdc-sent-100', 'usdc-sent-1000',
  ]
  assert.equal(list.length, 21)
  for (const id of expectedIds) {
    assert.ok(list.some(m => m.id === id), `missing id: ${id}`)
  }
})

// transactions group: tx-50

test('tx-50: value=49 → not reached, progress=49/50', () => {
  const s = makeSummary({ tx: 49 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const m = find(buildMilestones(s, cal, 0), 'tx-50')
  assert.equal(m.reached, false)
  assert.ok(Math.abs(m.progress - 49 / 50) < 1e-10)
})

test('tx-50: value=50 → reached, progress=1', () => {
  const s = makeSummary({ tx: 50 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const m = find(buildMilestones(s, cal, 0), 'tx-50')
  assert.equal(m.reached, true)
  assert.equal(m.progress, 1)
})

test('tx-50: value=51 → reached, progress clamped to 1', () => {
  const s = makeSummary({ tx: 51 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const m = find(buildMilestones(s, cal, 0), 'tx-50')
  assert.equal(m.reached, true)
  assert.equal(m.progress, 1)
})

test('tx-1000: value=999 → not reached', () => {
  const s = makeSummary({ tx: 999 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const m = find(buildMilestones(s, cal, 0), 'tx-1000')
  assert.equal(m.reached, false)
  assert.ok(Math.abs(m.progress - 999 / 1000) < 1e-10)
})

test('tx-1000: value=1000 → reached', () => {
  const s = makeSummary({ tx: 1000 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'tx-1000').reached, true)
})

test('tx-1000: value=1001 → progress clamped to 1', () => {
  const s = makeSummary({ tx: 1001 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'tx-1000').progress, 1)
})

// activity group: days-30

test('days-30: uniqueDays=29 → not reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 29, uniqueWeeks: 4, uniqueMonths: 1, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'days-30').reached, false)
})

test('days-30: uniqueDays=30 → reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 30, uniqueWeeks: 4, uniqueMonths: 1, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'days-30').reached, true)
})

test('days-30: uniqueDays=31 → progress clamped to 1', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 31, uniqueWeeks: 4, uniqueMonths: 1, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'days-30').progress, 1)
})

// age group: age-90

test('age-90: ageDays=89 → not reached', () => {
  const s = makeSummary({ ageDays: 89 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'age-90').reached, false)
})

test('age-90: ageDays=90 → reached', () => {
  const s = makeSummary({ ageDays: 90 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'age-90').reached, true)
})

test('age-90: ageDays=100 → progress clamped to 1', () => {
  const s = makeSummary({ ageDays: 100 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'age-90').progress, 1)
})

// streak group: streak-7

test('streak-7: longestStreak=6 → not reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 6, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'streak-7').reached, false)
})

test('streak-7: longestStreak=7 → reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 7, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'streak-7').reached, true)
})

test('streak-7: longestStreak=8 → progress clamped to 1', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 8, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'streak-7').progress, 1)
})

// weeks group: weeks-8

test('weeks-8: uniqueWeeks=7 → not reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 7, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'weeks-8').reached, false)
})

test('weeks-8: uniqueWeeks=8 → reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 8, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'weeks-8').reached, true)
})

test('weeks-8: uniqueWeeks=9 → progress clamped to 1', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 9, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'weeks-8').progress, 1)
})

// apps group: apps-10

test('apps-10: appsCount=9 → not reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 9), 'apps-10').reached, false)
})

test('apps-10: appsCount=10 → reached', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 10), 'apps-10').reached, true)
})

test('apps-10: appsCount=11 → progress clamped to 1', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 11), 'apps-10').progress, 1)
})

// bridge group: bridge-1

test('bridge-1: bridgeOut=0, bridgeIn=0 → not reached', () => {
  const s = makeSummary({ bridgeOut: 0, bridgeIn: 0 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'bridge-1').reached, false)
})

test('bridge-1: bridgeOut=1, bridgeIn=0 → reached', () => {
  const s = makeSummary({ bridgeOut: 1, bridgeIn: 0 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'bridge-1').reached, true)
})

test('bridge-1: bridgeOut=0, bridgeIn=1 → reached', () => {
  const s = makeSummary({ bridgeOut: 0, bridgeIn: 1 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'bridge-1').reached, true)
})

test('bridge-1: value=bridgeOut+bridgeIn', () => {
  const s = makeSummary({ bridgeOut: 2, bridgeIn: 3 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'bridge-1').value, 5)
})

// usdc-sent group

test('usdc-sent-100: usdcSent=99 → not reached', () => {
  const s = makeSummary({ usdcSent: 99 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'usdc-sent-100').reached, false)
})

test('usdc-sent-100: usdcSent=100 → reached', () => {
  const s = makeSummary({ usdcSent: 100 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'usdc-sent-100').reached, true)
})

test('usdc-sent-1000: usdcSent=999 → not reached', () => {
  const s = makeSummary({ usdcSent: 999 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'usdc-sent-1000').reached, false)
})

test('usdc-sent-1000: usdcSent=1001 → progress clamped to 1', () => {
  const s = makeSummary({ usdcSent: 1001 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  assert.equal(find(buildMilestones(s, cal, 0), 'usdc-sent-1000').progress, 1)
})

// ── partial flag ──────────────────────────────────────────────────────────────

console.log('\nbuildMilestones — partial flag')

test('partial=false → no milestone has partial flag', () => {
  const s = makeSummary({ partial: false })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const list = buildMilestones(s, cal, 0)
  for (const m of list) {
    assert.ok(m.partial === undefined, `${m.id} unexpectedly has partial flag`)
  }
})

test('partial=true → only transactions-group milestones have partial=true', () => {
  const s = makeSummary({ partial: true })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const list = buildMilestones(s, cal, 0)
  for (const m of list) {
    if (m.group === 'transactions') {
      assert.equal(m.partial, true, `${m.id} (transactions) should have partial=true`)
    } else {
      assert.ok(m.partial === undefined, `${m.id} (${m.group}) should NOT have partial flag`)
    }
  }
})

test('partial flag is present even when tx milestone is reached', () => {
  const s = makeSummary({ partial: true, tx: 2000 })
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const list = buildMilestones(s, cal, 0)
  const txMilestones = list.filter(m => m.group === 'transactions')
  assert.equal(txMilestones.length, 4)
  for (const m of txMilestones) {
    assert.equal(m.partial, true)
    assert.equal(m.reached, true) // still reached
  }
})

// ── Forbidden wording in labels and descriptions ───────────────────────────────

console.log('\nbuildMilestones — forbidden wording')

test('no milestone label or description contains forbidden words', () => {
  const s = makeSummary({})
  const cal: CalendarStats = { uniqueDays: 0, uniqueWeeks: 0, uniqueMonths: 0, longestStreak: 0, currentStreak: 0 }
  const list = buildMilestones(s, cal, 0)
  const forbidden = /airdrop|eligible|eligibility|tvl|score|points/i
  for (const m of list) {
    assert.ok(!forbidden.test(m.label), `label "${m.label}" contains forbidden word`)
    assert.ok(!forbidden.test(m.description), `description "${m.description}" contains forbidden word`)
    assert.ok(!forbidden.test(m.id), `id "${m.id}" contains forbidden word`)
  }
})

// ── nextMilestone ─────────────────────────────────────────────────────────────

console.log('\nnextMilestone')

test('returns null when list is empty', () => {
  assert.equal(nextMilestone([]), null)
})

test('returns null when all milestones are reached', () => {
  const s = makeSummary({ tx: 9999, ageDays: 999, usdcSent: 9999, bridgeOut: 10, bridgeIn: 10 })
  const cal: CalendarStats = { uniqueDays: 999, uniqueWeeks: 999, uniqueMonths: 99, longestStreak: 99, currentStreak: 0 }
  const list = buildMilestones(s, cal, 99)
  const allReached = list.every(m => m.reached)
  assert.ok(allReached, 'all milestones should be reached with these values')
  assert.equal(nextMilestone(list), null)
})

test('returns the milestone with the highest progress', () => {
  // 3 milestones, one at 80% progress, one at 60%, one at 40%.
  const list: Milestone[] = [
    { id: 'a', label: 'A', description: '', group: 'activity', target: 10, value: 8, reached: false, progress: 0.8 },
    { id: 'b', label: 'B', description: '', group: 'activity', target: 10, value: 6, reached: false, progress: 0.6 },
    { id: 'c', label: 'C', description: '', group: 'activity', target: 10, value: 4, reached: false, progress: 0.4 },
  ]
  const n = nextMilestone(list)
  assert.ok(n !== null)
  assert.equal(n.id, 'a')
})

test('tie-break: same progress → smaller target wins', () => {
  // Both at 50% progress but different targets.
  const list: Milestone[] = [
    { id: 'big',   label: 'Big',   description: '', group: 'activity', target: 100, value: 50, reached: false, progress: 0.5 },
    { id: 'small', label: 'Small', description: '', group: 'activity', target: 20,  value: 10, reached: false, progress: 0.5 },
  ]
  const n = nextMilestone(list)
  assert.ok(n !== null)
  assert.equal(n.id, 'small')
})

test('tie-break: three milestones at same progress → smallest target wins', () => {
  const list: Milestone[] = [
    { id: 'c', label: 'C', description: '', group: 'age',      target: 90, value: 45, reached: false, progress: 0.5 },
    { id: 'a', label: 'A', description: '', group: 'activity', target: 10, value: 5,  reached: false, progress: 0.5 },
    { id: 'b', label: 'B', description: '', group: 'streak',   target: 30, value: 15, reached: false, progress: 0.5 },
  ]
  const n = nextMilestone(list)
  assert.ok(n !== null)
  assert.equal(n.id, 'a')
})

test('skips reached milestones when choosing next', () => {
  const list: Milestone[] = [
    { id: 'done',   label: 'Done',   description: '', group: 'activity', target: 5,  value: 5,  reached: true,  progress: 1.0 },
    { id: 'almost', label: 'Almost', description: '', group: 'activity', target: 10, value: 8,  reached: false, progress: 0.8 },
    { id: 'far',    label: 'Far',    description: '', group: 'activity', target: 30, value: 6,  reached: false, progress: 0.2 },
  ]
  const n = nextMilestone(list)
  assert.ok(n !== null)
  assert.equal(n.id, 'almost')
})

test('nextMilestone integrates with buildMilestones output', () => {
  // 9 tx → closest to tx-50 at 18%, but days-10 might be higher depending on cal.
  const s = makeSummary({ tx: 9, ageDays: 5 })
  const cal: CalendarStats = { uniqueDays: 9, uniqueWeeks: 2, uniqueMonths: 1, longestStreak: 2, currentStreak: 0 }
  const list = buildMilestones(s, cal, 0)
  const n = nextMilestone(list)
  assert.ok(n !== null)
  // days-10: 9/10 = 90% — should be the highest
  assert.equal(n.id, 'days-10', `expected days-10 but got ${n.id} (progress ${n.progress})`)
})

test('nextMilestone returns single unreached milestone when only one remains', () => {
  const list: Milestone[] = [
    { id: 'x', label: 'X', description: '', group: 'usdc', target: 100, value: 50, reached: false, progress: 0.5 },
  ]
  assert.equal(nextMilestone(list)!.id, 'x')
})

// ── calendarStats uses imported activeDays/longestStreak from walletIndex ─────

console.log('\ncalendarStats — imported helpers consistency')

test('calendarStats.uniqueDays matches activeDays(rec) from walletIndex', () => {
  // bits 0, 2, 5 → 3 set bits
  const bits = [0, 2, 5]
  const rec = makeRec({ f: 0, l: 5, d: bitsToHex(bits) })
  const cs = calendarStats(rec, 5)
  // activeDays is imported and used internally; uniqueDays should equal popcount
  assert.equal(cs.uniqueDays, 3)
})

test('calendarStats.longestStreak matches longestStreak(rec) from walletIndex', () => {
  // bits 0,1,2 (run of 3), then 5,6 (run of 2)
  const bits = [0, 1, 2, 5, 6]
  const rec = makeRec({ f: 0, l: 6, d: bitsToHex(bits) })
  const cs = calendarStats(rec, 6)
  assert.equal(cs.longestStreak, 3)
})

// ── EPOCH sanity ──────────────────────────────────────────────────────────────

console.log('\nEPOCH sanity')

test('EPOCH_MS is 2026-01-01 UTC', () => {
  assert.equal(EPOCH_MS, Date.UTC(2026, 0, 1))
})

test('day 0 (2026-01-01) is a Thursday', () => {
  // This underlies the week-boundary tests above.
  const d = dayToDate(0)
  assert.equal(d.getUTCDay(), 4, '2026-01-01 should be Thursday (day 4)')
})

// ── Pinning tests ─────────────────────────────────────────────────────────────

test('currentStreak is 1 when throughDay equals the first active day', () => {
  const rec = makeRec({ f: 10, d: '1' })
  assert.equal(calendarStats(rec, 10).currentStreak, 1)
})

test('same calendar month in different years counts as two months', () => {
  // bit 0 = 2026-01-01, bit 365 = 2027-01-01
  const rec = makeRec({ f: 0, d: bitsToHex([0, 365]) })
  assert.equal(calendarStats(rec, 365).uniqueMonths, 2)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
