/** Pure list views behind the NFT, Token and app-detail pages: search, filter, sort and top wallets. */
import type { NftCollection, NftKind } from './nfts.ts'
import type { ArcToken, TokenGroup } from './tokens.ts'
import type { AppSample } from './appMetrics.ts'

export type NftFilter = 'All' | NftKind
export type NftSortKey = 'holders' | 'items' | 'transfers'
export type TokenFilter = 'All' | TokenGroup
export type TokenSortKey = 'holders' | 'supply' | 'name'

const matches = (q: string, ...fields: string[]) => !q || fields.some(f => f.toLowerCase().includes(q))

export function visibleNfts(data: readonly NftCollection[], filter: NftFilter, sort: NftSortKey, query: string): NftCollection[] {
  const q = query.trim().toLowerCase()
  return data
    .filter(c => (filter === 'All' || c.kind === filter) && matches(q, c.name, c.symbol, c.address))
    .sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1))
}

export function visibleTokens(tokens: readonly ArcToken[], filter: TokenFilter, sort: TokenSortKey, query: string): ArcToken[] {
  const q = query.trim().toLowerCase()
  const list = tokens.filter(t => (filter === 'All' || t.group === filter) && matches(q, t.name, t.symbol, t.address))
  return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort]))
}

export function tokenGroupCounts(tokens: readonly ArcToken[]): Record<string, number> {
  const c: Record<string, number> = { All: tokens.length }
  for (const t of tokens) c[t.group] = (c[t.group] ?? 0) + 1
  return c
}

/** The most active wallets in a sample, with how many events they took part in and the dollars they moved. */
export function topWalletsOf(sample: AppSample | null | undefined, limit = 15): [string, { n: number; usd: number }][] {
  if (!sample) return []
  const by = new Map<string, { n: number; usd: number }>()
  for (const a of sample.anchors) {
    for (const e of a.events) {
      for (const w of e.wallets) {
        const row = by.get(w) ?? { n: 0, usd: 0 }
        row.n++
        row.usd += e.usd ?? 0
        by.set(w, row)
      }
    }
  }
  return [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, limit)
}
