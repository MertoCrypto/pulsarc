/**
 * Pure helpers for deciding when the indexer snapshot can replace ArcScan,
 * and for converting indexer window data into the AppMetrics shape.
 *
 * No React, no network — safe for plain Node (--experimental-strip-types).
 * Only `import type` is used for external types.
 */

import type { AppWindowStats, AppsLatest } from './appsLatest.ts'
import type { AppMetrics, RankRange } from './appActivity.ts'
import { isFresh, windowsDiffer, toAppMetricsPatch } from './appsLatest.ts'

// ── isIndexerUsable ───────────────────────────────────────────────────────────

/** Ranges the indexer publishes windows for. */
const INDEXER_RANGES = new Set<string>(['1h', '24h', '7d'])

/**
 * True when the indexer snapshot is trustworthy enough to replace ArcScan for
 * the requested range.
 *
 * All conditions must hold:
 *   1. timeRange is one the indexer covers (not '30d' or 'all').
 *   2. snapshot is loaded (non-null).
 *   3. isFresh(snapshot, maxAgeMs, now).
 *   4. windowsDiffer(snapshot) — at least one app shows different 1h/24h/7d numbers,
 *      proving the indexer has actually caught up past the first partial hour.
 */
export function isIndexerUsable(
  snap: AppsLatest | null | undefined,
  timeRange: RankRange,
  now?: number,
): boolean {
  if (!INDEXER_RANGES.has(timeRange)) return false
  if (!snap) return false
  if (!isFresh(snap, 3 * 3_600_000, now)) return false
  if (!windowsDiffer(snap)) return false
  return true
}

// ── buildIndexerMetrics ───────────────────────────────────────────────────────

/**
 * Converts a single indexer window entry into an AppMetrics object.
 *
 * Fields:
 *   txCount       — from toAppMetricsPatch (w.txs)
 *   activeWallets — from toAppMetricsPatch (w.walletHours, an UPPER BOUND)
 *   volume        — null when 0 (no data)
 *   usdcFees      — null when 0 (no data)
 *   tvl           — always null (indexer does not track TVL)
 *   rankChange    — 0 (the hook fills this from the rank snapshot as today)
 *   trend         — null (no per-app trend data in the indexer)
 *   estimated     — false (indexer numbers are exact counts)
 *   usersKnown    — true (walletHours is a known count, even if an upper bound)
 *   lifetime      — omitted (undefined)
 */
export function buildIndexerMetrics(win: AppWindowStats): AppMetrics {
  const patch = toAppMetricsPatch(win)
  return {
    txCount: patch.txCount,
    activeWallets: patch.activeWallets,
    volume: patch.volume,
    usdcFees: patch.usdcFees,
    tvl: null,
    rankChange: 0,
    trend: null,
    estimated: false,
    usersKnown: true,
  }
}

// Re-export the helpers the hook needs so it has a single import target.
// The hook imports via @/ alias (bundler); these re-exports use relative paths
// so the module is also importable from plain Node without alias resolution.
export { isFresh, windowsDiffer, toAppMetricsPatch }
export type { AppWindowStats, AppsLatest }
