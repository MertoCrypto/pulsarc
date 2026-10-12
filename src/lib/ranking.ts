/** Pure ranking rules for the rankings table (sorting, rank numbers, rank movement, totals). */
import type { AppKind } from '@/data/apps'
import type { AppMetrics } from './appMetrics.ts'

export type SortKey = 'txCount' | 'activeWallets' | 'volume' | 'tvl' | 'usdcFees'

export interface Scorable {
  app: { id: string; kind: AppKind; category: string }
  metrics: AppMetrics
}

/** Apps with no value for the sort key (null) go below every real value, including 0. */
export const sortValue = (m: AppMetrics, key: SortKey) => m[key] ?? -1

export interface RankFilter {
  kind?: AppKind | 'all'
  category: string // 'All' = every category
}

/**
 * Sorts descending by `sortKey` (ties keep their input order), numbers every app 1..n over the whole
 * list (`ranksAll`), then keeps only the apps that match the filter and numbers those 1..m (`rank`).
 * `rankChange` compares with the whole-list rank saved earlier: positive = moved up. An app that was
 * not in the earlier ranking, or no earlier ranking at all, gives 0.
 */
export function rankApps<T extends Scorable>(
  scored: T[],
  sortKey: SortKey,
  filter: RankFilter,
  prevRanks: Record<string, number> | null,
): { items: (T & { rank: number })[]; ranksAll: Record<string, number> } {
  const sorted = [...scored].sort((a, b) => sortValue(b.metrics, sortKey) - sortValue(a.metrics, sortKey))

  const ranksAll: Record<string, number> = {}
  sorted.forEach((s, i) => { ranksAll[s.app.id] = i + 1 })

  const items = sorted
    .filter(s => (!filter.kind || filter.kind === 'all' || s.app.kind === filter.kind) && (filter.category === 'All' || s.app.category === filter.category))
    .map((s, i) => {
      const before = prevRanks?.[s.app.id]
      return { ...s, rank: i + 1, metrics: { ...s.metrics, rankChange: before ? before - ranksAll[s.app.id] : 0 } }
    })
  return { items, ranksAll }
}

export function sumTotals(items: { metrics: AppMetrics }[]) {
  return items.reduce(
    (acc, { metrics }) => ({
      volume: acc.volume + (metrics.volume ?? 0),
      activeWallets: acc.activeWallets + metrics.activeWallets,
      txCount: acc.txCount + metrics.txCount,
      tvl: acc.tvl + (metrics.tvl ?? 0),
    }),
    { volume: 0, activeWallets: 0, txCount: 0, tvl: 0 },
  )
}
