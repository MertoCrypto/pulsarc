import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'

export type NftKind = 'ERC-721' | 'ERC-1155'

export interface NftCollection {
  address: string
  name: string
  symbol: string
  kind: NftKind
  holders: number
  items: number | null    // total minted, when the contract reports it
  transfers: number | null // all-time transfers
}

interface RawToken {
  address_hash: string
  name: string | null
  symbol: string | null
  holders_count: string | null
  total_supply: string | null
}
interface Page { items: RawToken[]; next_page_params: Record<string, unknown> | null }
interface Counters { transfers_count: string }

async function top(type: NftKind, pages: number): Promise<NftCollection[]> {
  const out: NftCollection[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < pages; i++) {
    const page: Page = await arcscan<Page>('/tokens', { type, ...(cursor ?? {}) })
    for (const t of page.items) {
      out.push({
        address: t.address_hash,
        name: t.name ?? 'Unnamed collection',
        symbol: t.symbol ?? '—',
        kind: type,
        holders: Number(t.holders_count ?? 0),
        items: t.total_supply ? Number(t.total_supply) : null,
        transfers: null,
      })
    }
    cursor = page.next_page_params
    if (!cursor) break
  }
  return out
}

async function load(): Promise<NftCollection[]> {
  const [a, b] = await Promise.all([top('ERC-721', 2), top('ERC-1155', 1)])
  const all = [...a, ...b].sort((x, y) => y.holders - x.holders)
  // Transfer counts cost one request each, so only the biggest collections get them.
  await Promise.all(all.slice(0, 30).map(async c => {
    try {
      const k = await arcscan<Counters>(`/tokens/${c.address}/counters`)
      c.transfers = Number(k.transfers_count)
    } catch { /* leave null */ }
  }))
  return all
}

export function useNfts() {
  return useQuery({ queryKey: ['arcscan-nfts'], queryFn: load, staleTime: 5 * 60_000, retry: 2 })
}
