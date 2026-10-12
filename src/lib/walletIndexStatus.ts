/**
 * Pure status helpers for the Wallet Index coverage card.
 * No React, no network calls.
 * Uses relative imports so this file is runnable with
 * `node --experimental-strip-types` without a bundler alias.
 */

import { type MetaJson, dayToDate, EPOCH_MS } from './walletIndex.ts'

export type IndexState = 'ok' | 'behind' | 'gaps'

export interface IndexStatusResult {
  state: IndexState
  daysBehind: number
  text: string
}

/**
 * Compute the whole UTC days between today (nowMs) and meta.through.
 *
 * meta.through is a day number relative to EPOCH_MS (day 0 = 2026-01-01 UTC).
 * throughMs is the start of that UTC day.
 * todayDay is the whole UTC day number for nowMs (floor).
 * daysBehind = todayDay − meta.through   (0 means the index closed today)
 */
function computeDaysBehind(throughDay: number, nowMs: number): number {
  const todayDay = Math.floor((nowMs - EPOCH_MS) / 86_400_000)
  return Math.max(0, todayDay - throughDay)
}

/**
 * Format walletCount with thousands separators (en-US locale).
 */
function fmtCount(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * Plain English status sentence.
 * Example: "Closed days 2026-01-06 to 2026-10-11, 50,599 wallets."
 */
function buildText(meta: MetaJson): string {
  const day = (d: number) => dayToDate(d).toISOString().slice(0, 10)
  return `Closed days ${day(meta.since)} to ${day(meta.through)}, ${fmtCount(meta.walletCount)} wallets.`
}

/**
 * Returns the status of the wallet index given the meta document and the
 * current wall-clock time in milliseconds.
 *
 * State priority (highest first):
 *   'behind' — daysBehind > 2
 *   'gaps'   — meta.gaps is non-empty
 *   'ok'     — everything else
 */
export function indexStatus(meta: MetaJson, nowMs: number): IndexStatusResult {
  const daysBehind = computeDaysBehind(meta.through, nowMs)
  const text = buildText(meta)

  // 'behind' wins over 'gaps'
  if (daysBehind > 2) {
    return { state: 'behind', daysBehind, text }
  }
  if (meta.gaps.length > 0) {
    return { state: 'gaps', daysBehind, text }
  }
  return { state: 'ok', daysBehind, text }
}
