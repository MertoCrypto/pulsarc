/** Pure share-of-total breakdowns used by the ecosystem and wallet cards. */
import type { AppCategory } from '@/data/apps'

export interface CategoryShare { category: AppCategory; tx: number; pct: number }

export function categoryShares(items: readonly { app: { category: AppCategory }; metrics: { txCount: number } }[]): CategoryShare[] {
  const by = new Map<AppCategory, number>()
  for (const { app, metrics } of items) by.set(app.category, (by.get(app.category) ?? 0) + metrics.txCount)
  const total = [...by.values()].reduce((a, b) => a + b, 0) || 1
  return [...by.entries()]
    .map(([category, tx]) => ({ category, tx, pct: (tx / total) * 100 }))
    .sort((a, b) => b.tx - a.tx)
}

export function balanceShares<T extends { value: number }>(items: readonly T[]): (T & { pct: number })[] {
  const kept = items.filter(x => x.value > 0).sort((a, b) => b.value - a.value)
  const total = kept.reduce((s, x) => s + x.value, 0)
  return kept.map(x => ({ ...x, pct: total ? (x.value / total) * 100 : 0 }))
}
