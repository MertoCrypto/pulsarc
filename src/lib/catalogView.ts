/** Pure list views behind the NFT, Token and app-detail pages: search, filter, sort and top wallets. */
import type { NftCollection, NftKind } from './nfts.ts'
import type { ArcToken, TokenGroup } from './tokens.ts'
import type { AppSample } from './appMetrics.ts'

export type NftFilter = 'All' | NftKind
export type NftSortKey = 'holders' | 'items' | 'transfers'
export type TokenFilter = 'All' | TokenGroup
export type TokenSortKey = 'holders' | 'supply' | 'name' | 'featured'

/**
 * Build a lower-cased set of token anchor addresses from an app registry.
 * Only anchors with kind === 'token' are included.
 */
export function verifiedTokenSet(
  apps: readonly { anchors: readonly { address: string; kind: string }[] }[],
): Set<string> {
  const out = new Set<string>()
  for (const a of apps) {
    for (const anchor of a.anchors) {
      if (anchor.kind === 'token') out.add(anchor.address.toLowerCase())
    }
  }
  return out
}

/**
 * Group priority for 'featured' sort: recognised groups come first in definition order,
 * 'Other' last. Any unknown group value falls back to the 'Other' bucket.
 */
const FEATURED_GROUP_ORDER: Record<string, number> = {
  Stablecoin: 0,
  RWA: 1,
  'LP & Vaults': 2,
  Other: 3,
}

const matches = (q: string, ...fields: string[]) => !q || fields.some(f => f.toLowerCase().includes(q))

export function visibleNfts(data: readonly NftCollection[], filter: NftFilter, sort: NftSortKey, query: string): NftCollection[] {
  const q = query.trim().toLowerCase()
  return data
    .filter(c => (filter === 'All' || c.kind === filter) && matches(q, c.name, c.symbol, c.address))
    .sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1))
}

export function visibleTokens(
  tokens: readonly ArcToken[],
  filter: TokenFilter,
  sort: TokenSortKey,
  query: string,
  verified?: ReadonlySet<string>,
): ArcToken[] {
  const q = query.trim().toLowerCase()
  const list = tokens.filter(t => (filter === 'All' || t.group === filter) && matches(q, t.name, t.symbol, t.address))
  if (sort === 'featured') {
    const vset: ReadonlySet<string> = verified ?? new Set<string>()
    return [...list].sort((a, b) => {
      const av = vset.has(a.address.toLowerCase()) ? 0 : 1
      const bv = vset.has(b.address.toLowerCase()) ? 0 : 1
      if (av !== bv) return av - bv
      const ga = FEATURED_GROUP_ORDER[a.group] ?? FEATURED_GROUP_ORDER['Other']
      const gb = FEATURED_GROUP_ORDER[b.group] ?? FEATURED_GROUP_ORDER['Other']
      if (ga !== gb) return ga - gb
      if (b.supply !== a.supply) return b.supply - a.supply
      return a.name.localeCompare(b.name, 'en')
    })
  }
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
