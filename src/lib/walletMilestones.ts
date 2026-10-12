/**
 * Pure, dependency-free helpers that derive activity milestones from a wallet
 * index record. No framework, no network calls.
 *
 * Bit convention (matches walletIndex.ts):
 *   BigInt('0x' + rec.d) >> n  reads bit n from the LSB.
 *   Bit n = 1 means day (rec.f + n) had activity.
 */

import {
  dayToDate,
  activeDays,
  longestStreak,
  type WalletRecord,
  type WalletSummary,
} from './walletIndex.ts'

// ── Calendar stats ─────────────────────────────────────────────────────────────

export interface CalendarStats {
  uniqueDays: number
  uniqueWeeks: number
  uniqueMonths: number
  longestStreak: number
  currentStreak: number
}

/**
 * Derive calendar statistics from a wallet record.
 *
 * @param rec        The raw wallet record (bitmap in rec.d, first-active day in rec.f).
 * @param throughDay The most recent closed day number (relative to EPOCH). Used to
 *                   compute currentStreak: the run of consecutive active days ending
 *                   at throughDay. Returns 0 if throughDay itself is inactive or
 *                   throughDay < rec.f.
 */
export function calendarStats(rec: WalletRecord, throughDay: number): CalendarStats {
  const bitmap = BigInt('0x' + rec.d)

  const weeks = new Set<string>()
  const months = new Set<string>()

  // Iterate over every set bit to collect calendar facts.
  // Bit n corresponds to day (rec.f + n).
  let tmp = bitmap
  let bitIndex = 0
  while (tmp > 0n) {
    if (tmp & 1n) {
      const day = rec.f + bitIndex
      const d = dayToDate(day)
      const utcYear = d.getUTCFullYear()
      const utcMonth = d.getUTCMonth() // 0-indexed
      months.add(`${utcYear}-${utcMonth}`)

      // ISO-style Monday-start week key.
      // Shift the UTC day-of-week so Monday=0 … Sunday=6.
      const dow = (d.getUTCDay() + 6) % 7 // Mon=0, …, Sun=6
      const monday = new Date(d.getTime() - dow * 86_400_000)
      weeks.add(`${monday.getUTCFullYear()}-${monday.getUTCMonth()}-${monday.getUTCDate()}`)
    }
    tmp >>= 1n
    bitIndex++
  }

  // currentStreak: consecutive active days ending at throughDay (walking backwards).
  let currentStreak = 0
  if (throughDay >= rec.f) {
    const maxBit = throughDay - rec.f
    // Check that throughDay itself is set before counting.
    if ((bitmap >> BigInt(maxBit)) & 1n) {
      currentStreak = 1
      for (let b = maxBit - 1; b >= 0; b--) {
        if ((bitmap >> BigInt(b)) & 1n) {
          currentStreak++
        } else {
          break
        }
      }
    }
  }

  return {
    uniqueDays: activeDays(rec),
    uniqueWeeks: weeks.size,
    uniqueMonths: months.size,
    longestStreak: longestStreak(rec),
    currentStreak,
  }
}

// ── Milestone interface ────────────────────────────────────────────────────────

export interface Milestone {
  id: string
  label: string
  description: string
  group: 'transactions' | 'activity' | 'age' | 'streak' | 'apps' | 'bridge' | 'usdc'
  target: number
  value: number
  reached: boolean
  /** Clamped to [0, 1]. */
  progress: number
  /** Present and true when the underlying data may be incomplete (summary.partial). */
  partial?: true
}

// ── Milestone definitions ──────────────────────────────────────────────────────

interface MilestoneDef {
  id: string
  label: string
  description: string
  group: Milestone['group']
  target: number
}

const MILESTONE_DEFS: MilestoneDef[] = [
  // transactions
  { id: 'tx-50',   group: 'transactions', target: 50,   label: '50 transactions',   description: 'Sent 50 transactions' },
  { id: 'tx-100',  group: 'transactions', target: 100,  label: '100 transactions',  description: 'Sent 100 transactions' },
  { id: 'tx-500',  group: 'transactions', target: 500,  label: '500 transactions',  description: 'Sent 500 transactions' },
  { id: 'tx-1000', group: 'transactions', target: 1000, label: '1000 transactions', description: 'Sent 1000 transactions' },

  // activity
  { id: 'days-10', group: 'activity', target: 10, label: '10 active days',  description: 'Active on 10 different days' },
  { id: 'days-20', group: 'activity', target: 20, label: '20 active days',  description: 'Active on 20 different days' },
  { id: 'days-30', group: 'activity', target: 30, label: '30 active days',  description: 'Active on 30 different days' },

  // age
  { id: 'age-30', group: 'age', target: 30, label: '30 days old',  description: 'Wallet active for 30 days' },
  { id: 'age-60', group: 'age', target: 60, label: '60 days old',  description: 'Wallet active for 60 days' },
  { id: 'age-90', group: 'age', target: 90, label: '90 days old',  description: 'Wallet active for 90 days' },

  // streak
  { id: 'streak-3', group: 'streak', target: 3, label: '3-day streak',  description: 'Active 3 consecutive days' },
  { id: 'streak-5', group: 'streak', target: 5, label: '5-day streak',  description: 'Active 5 consecutive days' },
  { id: 'streak-7', group: 'streak', target: 7, label: '7-day streak',  description: 'Active 7 consecutive days' },

  // weeks
  { id: 'weeks-4', group: 'streak', target: 4, label: 'Active 4 different weeks',  description: 'Active in 4 different weeks' },
  { id: 'weeks-8', group: 'streak', target: 8, label: 'Active 8 different weeks',  description: 'Active in 8 different weeks' },

  // apps
  { id: 'apps-3',  group: 'apps', target: 3,  label: '3 apps used',  description: 'Used 3 different apps' },
  { id: 'apps-5',  group: 'apps', target: 5,  label: '5 apps used',  description: 'Used 5 different apps' },
  { id: 'apps-10', group: 'apps', target: 10, label: '10 apps used', description: 'Used 10 different apps' },

  // bridge
  { id: 'bridge-1', group: 'bridge', target: 1, label: 'First bridge', description: 'Completed at least 1 bridge transaction' },

  // usdc
  { id: 'usdc-sent-100',  group: 'usdc', target: 100,  label: 'Sent 100 USDC',  description: 'Sent at least 100 USDC in total' },
  { id: 'usdc-sent-1000', group: 'usdc', target: 1000, label: 'Sent 1000 USDC', description: 'Sent at least 1000 USDC in total' },
]

// ── Build milestones ───────────────────────────────────────────────────────────

/**
 * Build the full milestone list from a wallet summary, calendar stats, and an
 * apps count.
 *
 * Milestones in the 'transactions' group are marked partial when summary.partial
 * is true, because tx/failed/fees may be under-counted in that case.
 */
export function buildMilestones(
  summary: WalletSummary,
  cal: CalendarStats,
  appsCount: number,
): Milestone[] {
  function valueOf(def: MilestoneDef): number {
    switch (def.id) {
      case 'tx-50':
      case 'tx-100':
      case 'tx-500':
      case 'tx-1000':
        return summary.tx

      case 'days-10':
      case 'days-20':
      case 'days-30':
        return cal.uniqueDays

      case 'age-30':
      case 'age-60':
      case 'age-90':
        return summary.ageDays

      case 'streak-3':
      case 'streak-5':
      case 'streak-7':
        return cal.longestStreak

      case 'weeks-4':
      case 'weeks-8':
        return cal.uniqueWeeks

      case 'apps-3':
      case 'apps-5':
      case 'apps-10':
        return appsCount

      case 'bridge-1':
        return summary.bridgeOut + summary.bridgeIn

      case 'usdc-sent-100':
      case 'usdc-sent-1000':
        return summary.usdcSent

      default:
        return 0
    }
  }

  return MILESTONE_DEFS.map((def): Milestone => {
    const value = valueOf(def)
    const reached = value >= def.target
    const progress = Math.min(1, def.target > 0 ? value / def.target : 0)
    const base: Milestone = {
      id: def.id,
      label: def.label,
      description: def.description,
      group: def.group,
      target: def.target,
      value,
      reached,
      progress,
    }
    if (def.group === 'transactions' && summary.partial) {
      return { ...base, partial: true }
    }
    return base
  })
}

// ── Next milestone ─────────────────────────────────────────────────────────────

/**
 * Return the single most-progressed unreached milestone.
 * Ties are broken by choosing the one with the smaller target.
 * Returns null when every milestone has been reached.
 */
export function nextMilestone(list: Milestone[]): Milestone | null {
  let best: Milestone | null = null
  for (const m of list) {
    if (m.reached) continue
    if (best === null) {
      best = m
      continue
    }
    if (
      m.progress > best.progress ||
      (m.progress === best.progress && m.target < best.target)
    ) {
      best = m
    }
  }
  return best
}
