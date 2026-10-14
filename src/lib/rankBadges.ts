/**
 * Pure helpers for per-window rank badges shown on an app's detail page.
 *
 * No '@/' imports, no import.meta — safe to run in Node test runner.
 * All imports use explicit .ts extensions, matching the other pure libs here.
 */
import { rankApps } from './ranking.ts'
import type { AppMetrics } from './appMetrics.ts'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BadgeWindow = '24h' | '7d' | '30d'

export interface WindowMetrics {
  /** App identifier (matches ArcApp.id). */
  appKey: string
  metrics: AppMetrics
}

export interface RankBadge {
  /** The time window this badge describes. */
  window: BadgeWindow
  /** 1-based rank of this app among all apps for this window. */
  rank: number
  /** Total number of apps with usable data for this window (the "of N" denominator). */
  of: number
}

// ── computeRankBadges ─────────────────────────────────────────────────────────

/**
 * Given per-app metrics for a single time window, the target app key, and the
 * set of windows that are allowed on the current network, return a RankBadge
 * for each window that passes every gate:
 *
 *   1. The window is in `allowedWindows`.
 *   2. `windowMetrics` for that window is non-null and non-empty (indexer has
 *      usable data).
 *   3. The target app appears in the list and has at least 1 active wallet.
 *
 * Sort order (must match the Rankings page "active wallets" column):
 *   Primary   — activeWallets descending
 *   Secondary — txCount descending (tie-break)
 *   Tertiary  — appKey ascending lexicographic (stable, deterministic)
 *
 * Because rankApps uses Array.prototype.sort (stable in every JS engine that
 * supports the spec) and the input array is pre-sorted by (txCount desc, appKey
 * asc) before being passed in, rankApps's own stable sort on activeWallets
 * preserves that secondary/tertiary order automatically.
 *
 * @param windowMetrics  Map from window label to the per-app metrics for that
 *                       window.  Pass `null` for a window whose indexer data is
 *                       not usable.
 * @param appKey         The app whose rank we want.
 * @param allowedWindows Windows that are enabled on the current network
 *                       (from `disabledRangesFor`).
 */
export function computeRankBadges(
  windowMetrics: Partial<Record<BadgeWindow, WindowMetrics[] | null>>,
  appKey: string,
  allowedWindows: BadgeWindow[],
): RankBadge[] {
  const badges: RankBadge[] = []

  for (const win of allowedWindows) {
    const list = windowMetrics[win]

    // Gate 1: window allowed (already enforced by iterating allowedWindows)
    // Gate 2: indexer data is usable (non-null, non-empty)
    if (!list || list.length === 0) continue

    // Gate 3: target app has at least 1 active wallet
    const targetEntry = list.find(e => e.appKey === appKey)
    if (!targetEntry || targetEntry.metrics.activeWallets < 1) continue

    // Build Scorable items sorted deterministically so that Array.sort's
    // stability preserves the secondary (txCount desc) and tertiary (appKey
    // asc) tie-break after rankApps sorts on activeWallets.
    const scorable = [...list]
      .sort((a, b) => {
        const txDiff = b.metrics.txCount - a.metrics.txCount
        if (txDiff !== 0) return txDiff
        return a.appKey < b.appKey ? -1 : a.appKey > b.appKey ? 1 : 0
      })
      .map(e => ({
        app: { id: e.appKey, kind: 'app' as const, category: 'All' },
        metrics: e.metrics,
      }))

    const { ranksAll } = rankApps(scorable, 'activeWallets', { category: 'All' }, null)

    const rank = ranksAll[appKey]
    if (rank === undefined) continue

    badges.push({ window: win, rank, of: list.length })
  }

  return badges
}
