/**
 * Pure, dependency-free functions that convert mainnet hourly indexer data
 * (HourlyPoint arrays from hourlyApps.ts) into the History and AppMetrics
 * shapes consumed by DApp.tsx and Compare.tsx.
 *
 * NO React, NO '@/' aliases that need bundler resolution — safe for
 * `node --experimental-strip-types` unit tests.
 *
 * Key design notes
 * ─────────────────
 * buildHistory (appMetrics.ts) uses a variable bucket width: it chooses
 * n=12 buckets when coveredMs ≤ 2 hours, n=24 otherwise, and derives
 * bucketMs = coveredMs / n.  Hourly indexer data is pre-bucketed at exactly
 * 1 hour each, so we mirror that: for a 1-hour window we use the single
 * matching hour-slot (1 bucket = 1 h); for a 24-hour window we use the last
 * 24 hour-slots (each bucket = 1 h, n=24).  labelFor in buildHistory picks
 * format based on coveredMs: ≤36 h → 'HH:mm', >36 h → 'M/D'.  Our
 * coveredMs is always ≤ 24 h so every label is 'HH:00'.
 *
 * Differences from buildHistory:
 *  1. Bucket width is fixed at 3 600 000 ms (1 h) rather than coveredMs/n.
 *  2. activeWallets per slot comes from the indexer's per-hour wallet count,
 *     NOT a Set<string> dedup (hourly wallets are per-hour uniques; across
 *     slots the same wallet may be counted twice — hence estimated:true).
 *  3. For the 'total' series, activeWallets is the max across apps per hour
 *     (same conservative approach as buildHistoryFromHourly) rather than a
 *     union of wallet sets (which isn't possible without raw addresses).
 *  4. tvl is always null (hourly files carry no balance snapshot).
 *  5. rankChange is always 0; trend is always null (no prior-window data).
 */

import { appSeriesFromHourly, buildHistoryFromHourly } from './hourlyApps.ts'
import type { HourlyHour, HourlyPoint } from './hourlyApps.ts'

// ── Re-export the types the hook layer needs ──────────────────────────────────

export type { HourlyHour, HourlyPoint }

// ── Shared type stubs (mirrors appMetrics.ts) ─────────────────────────────────
// These duplicate the interface shapes so this file stays free of '@/' imports.

export interface HistoryPoint {
  label:         string
  activeWallets: number
  txCount:       number
  volume:        number
  usdcFees:      number
}

export interface History {
  perApp:    Record<string, HistoryPoint[]>
  total:     HistoryPoint[]
  coveredMs: number
  complete:  boolean
}

export interface AppMetrics {
  txCount:       number
  activeWallets: number
  volume:        number | null
  tvl:           number | null   // always null for hourly-backed data
  usdcFees:      number | null
  rankChange:    number           // always 0
  trend:         null             // always null
  estimated:     boolean
  lifetime?:     boolean
  usersKnown?:   boolean
}

// ── Internal constants ────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000

// ── Hour-key filtering ────────────────────────────────────────────────────────

/**
 * Keep only hour-keys whose UTC wall-clock time falls inside [windowStart, now).
 *
 * @param files       One or more day-file objects (merged by appSeriesFromHourly).
 * @param windowMs    Length of the window in milliseconds (3_600_000 or 86_400_000).
 * @param nowMs       Reference "now" (defaults to Date.now()).
 * @returns           Filtered + sorted array of { hourKey, bucketStartMs }.
 */
function hoursInWindow(
  files: Record<string, HourlyHour>[],
  windowMs: number,
  nowMs: number,
): string[] {
  // Collect all valid hour keys across the merged files.
  const merged: Record<string, HourlyHour> = {}
  for (const f of files) {
    if (f == null || typeof f !== 'object') continue
    for (const [k, v] of Object.entries(f)) {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(k) && v != null && typeof v === 'object') {
        merged[k] = v as HourlyHour
      }
    }
  }

  const windowStart = nowMs - windowMs
  return Object.keys(merged)
    .filter(k => {
      const ts = Date.UTC(
        Number(k.slice(0, 4)),
        Number(k.slice(5, 7)) - 1,
        Number(k.slice(8, 10)),
        Number(k.slice(11, 13)),
      )
      return ts >= windowStart && ts < nowMs
    })
    .sort()
}

// ── Label helper (mirrors labelFor in appMetrics.ts) ─────────────────────────

/**
 * 'YYYY-MM-DDTHH' → 'HH:00'
 * Our coveredMs is always ≤ 24 h so labelFor always picks 'HH:mm' format.
 */
function labelFor(hourKey: string): string {
  const hh = hourKey.slice(11, 13)
  return `${hh}:00`
}

// ── buildHourlyHistory ────────────────────────────────────────────────────────

/**
 * Build History and per-app AppMetrics from merged hourly indexer files.
 *
 * @param files      Ordered day-file array (oldest first; last-writer-wins for
 *                   duplicate hour keys — same contract as appSeriesFromHourly).
 * @param appIds     App IDs to include.
 * @param windowMs   3_600_000 (1h) or 86_400_000 (24h).
 * @param nowMs      Reference "now" (pass explicitly in tests).
 * @returns          { history, metricsPerApp }
 */
export function buildHourlyHistory(
  files: Record<string, HourlyHour>[],
  appIds: string[],
  windowMs: number,
  nowMs: number = Date.now(),
): { history: History; metricsPerApp: Record<string, AppMetrics> } {

  // ── 1. Determine which hours fall in the window ───────────────────────────
  const windowHours = hoursInWindow(files, windowMs, nowMs)

  // ── 2. Extract per-app series (all hours in the files, not yet filtered) ──
  //      appSeriesFromHourly handles dedup/corrupt/missing rows.
  const allSeries = appSeriesFromHourly(files, appIds)

  // ── 3. Filter each app's series to window hours only ─────────────────────
  const windowSet = new Set(windowHours)
  const windowSeries: Record<string, HourlyPoint[]> = {}
  for (const id of appIds) {
    windowSeries[id] = (allSeries[id] ?? []).filter(p => windowSet.has(p.hour))
  }

  // ── 4. Determine completeness ─────────────────────────────────────────────
  //      We need `floor(windowMs / HOUR_MS)` hours (1 for 1h, 24 for 24h).
  const expectedHours = Math.floor(windowMs / HOUR_MS)
  const complete = windowHours.length >= expectedHours

  // ── 5. Build History via buildHistoryFromHourly ───────────────────────────
  //      That function aligns all apps to the full hour set and builds total.
  const rawHistory = buildHistoryFromHourly(windowSeries, complete)

  // Cast HistoryPointLike[] → HistoryPoint[] (fields are identical).
  const history: History = {
    perApp: rawHistory.perApp as Record<string, HistoryPoint[]>,
    total:  rawHistory.total  as HistoryPoint[],
    coveredMs: rawHistory.coveredMs,
    complete:  rawHistory.complete,
  }

  // ── 6. Compute AppMetrics per app ─────────────────────────────────────────
  const metricsPerApp: Record<string, AppMetrics> = {}

  for (const id of appIds) {
    const pts = windowSeries[id] ?? []

    let txCount       = 0
    let activeWallets = 0
    let volume        = 0
    let usdcFees      = 0
    let hasVol        = false
    let hasFees       = false

    for (const p of pts) {
      txCount       += p.tx
      // NOTE: wallets is the per-hour unique count from the indexer.
      // Summing across hours gives an UPPER BOUND because the same wallet
      // may appear in multiple hours.  Mark estimated:true to signal this.
      activeWallets += p.wallets
      if (p.vol  > 0) { volume   += p.vol;  hasVol  = true }
      if (p.fee  > 0) { usdcFees += p.fee;  hasFees = true }
    }

    const estimated = !complete

    metricsPerApp[id] = {
      txCount,
      // activeWallets is an upper bound (wallets summed across hours ≥ real unique count)
      activeWallets,
      volume:    hasVol  ? volume   : null,
      tvl:       null,                // hourly files carry no balance snapshot
      usdcFees:  hasFees ? usdcFees : null,
      rankChange: 0,
      trend:      null,
      estimated,
    }
  }

  return { history, metricsPerApp }
}

// ── Single-app convenience wrapper ────────────────────────────────────────────

/**
 * Same as buildHourlyHistory but returns a single AppMetrics for one app.
 * Used by useAppHistoryMainnet.
 */
export function buildHourlyMetrics(
  files: Record<string, HourlyHour>[],
  appId: string,
  windowMs: number,
  nowMs?: number,
): AppMetrics {
  const { metricsPerApp } = buildHourlyHistory(files, [appId], windowMs, nowMs)
  return metricsPerApp[appId] ?? {
    txCount: 0, activeWallets: 0, volume: null, tvl: null,
    usdcFees: null, rankChange: 0, trend: null, estimated: false,
  }
}

// Re-export labelFor for tests
export { labelFor }
