import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { sortByHolders, toNftCollection, type NftCollection, type NftKind, type RawNftToken } from '@/lib/nfts'

export type { NftKind, NftCollection } from '@/lib/nfts'

interface Page { items: RawNftToken[]; next_page_params: Record<string, unknown> | null }
interface Counters { transfers_count: string }

async function top(type: NftKind, pages: number): Promise<NftCollection[]> {
  const out: NftCollection[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < pages; i++) {
    const page: Page = await arcscan<Page>('/tokens', { type, ...(cursor ?? {}) })
    for (const t of page.items) {
      out.push(toNftCollection(t, type))
    }
    cursor = page.next_page_params
    if (!cursor) break
  }
  return out
}

async function load(): Promise<NftCollection[]> {
  const [a, b] = await Promise.all([top('ERC-721', 2), top('ERC-1155', 1)])
  const all = sortByHolders([...a, ...b])
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
