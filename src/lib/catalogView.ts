/** Pure list views behind the NFT, Token and app-detail pages: search, filter, sort and top wallets. */
import type { NftCollection, NftKind } from './nfts.ts'
import type { ArcToken, TokenGroup } from './tokens.ts'
import type { AppSample } from './appMetrics.ts'

export type NftFilter = 'All' | NftKind
export type NftSortKey = 'holders' | 'items' | 'transfers'
export type TokenFilter = 'All' | TokenGroup
export type TokenSortKey = 'volume' | 'holders' | 'marketCap' | 'supply' | 'name' | 'featured'

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

/**
 * Compare two nullable numbers for descending sort: non-null values first (desc),
 * then null values last. Returns 0 when both are equally null or equal.
 */
function cmpNullableDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1   // a is null → goes after b
  if (b === null) return -1  // b is null → goes after a
  return b - a
}

/**
 * Primary comparator for the 'volume' sort (and the verified-first layer used by
 * every sort except 'name' and 'supply').
 *
 * Order:
 *   1. Verified first (when a verified set is supplied).
 *   2. volume24h desc (null / 0 last).
 *   3. holders desc.
 *   4. marketCap desc (null last).
 *   5. name asc (stable tie-break).
 */
function cmpByVolume(
  a: ArcToken,
  b: ArcToken,
  vset: ReadonlySet<string>,
): number {
  const av = vset.has(a.address.toLowerCase()) ? 0 : 1
  const bv = vset.has(b.address.toLowerCase()) ? 0 : 1
  if (av !== bv) return av - bv
  // Treat 0-volume the same as null — no real activity.
  const aVol = (a.volume24h === null || a.volume24h === 0) ? null : a.volume24h
  const bVol = (b.volume24h === null || b.volume24h === 0) ? null : b.volume24h
  const d1 = cmpNullableDesc(aVol, bVol)
  if (d1 !== 0) return d1
  const d2 = b.holders - a.holders
  if (d2 !== 0) return d2
  const d3 = cmpNullableDesc(a.marketCap, b.marketCap)
  if (d3 !== 0) return d3
  return a.name.localeCompare(b.name, 'en')
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
  const vset: ReadonlySet<string> = verified ?? new Set<string>()

  if (sort === 'featured') {
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

  if (sort === 'volume') {
    return [...list].sort((a, b) => cmpByVolume(a, b, vset))
  }

  if (sort === 'name') {
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }

  if (sort === 'marketCap') {
    return [...list].sort((a, b) => {
      const av = vset.has(a.address.toLowerCase()) ? 0 : 1
      const bv = vset.has(b.address.toLowerCase()) ? 0 : 1
      if (av !== bv) return av - bv
      return cmpNullableDesc(a.marketCap, b.marketCap)
    })
  }

  // 'holders' or 'supply' — plain numeric desc
  return [...list].sort((a, b) => b[sort] - a[sort])
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
