/**
 * useNfts — data hook for the NFTs page.
 *
 * NETWORK SELECTION (module-level, safe for the React hook rule):
 * On Arc Mainnet (NETWORK.id === 5042) the hook fetches from the indexer catalog
 * instead of ArcScan. Same URL as useTokens — catalog contains both tokens and nfts.
 *
 * Testnet code and queryKeys are byte-for-byte identical to the original.
 */
import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { sortByHolders, toNftCollection, type NftCollection, type NftKind, type RawNftToken } from '@/lib/nfts'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'
import { parseCatalog, toNftRows } from '@/lib/catalog'
import { NETWORK } from '@/lib/chain'

export type { NftKind, NftCollection } from '@/lib/nfts'

// ─── Testnet: ArcScan paged load ──────────────────────────────────────────────

interface Page { items: RawNftToken[]; next_page_params: Record<string, unknown> | null }
interface Counters { transfers_count: string }

async function top(type: NftKind, pages: number): Promise<NftCollection[]> {
  const out: NftCollection[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < pages; i++) {
    const page: Page = await arcscan<Page>('/tokens', { type, ...(cursor as Record<string, string | number | boolean | null | undefined> ?? {}) })
    for (const t of page.items) {
      out.push(toNftCollection(t, type))
    }
    cursor = page.next_page_params
    if (!cursor) break
  }
  return out
}

async function loadNftsTestnet(): Promise<NftCollection[]> {
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

// ─── Mainnet: indexer catalog ─────────────────────────────────────────────────

// Hardcoded: this URL belongs to the mainnet indexer job specifically.
// There is no testnet catalog at this repository path.
const MAINNET_CATALOG_URL =
  'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/catalog.json'

async function loadNftsMainnet(): Promise<NftCollection[]> {
  const res = await fetchWithTimeout(MAINNET_CATALOG_URL)
  if (res.status === 404) {
    // Catalog not yet produced — return empty list; UI shows building state.
    return []
  }
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`)
  const raw: unknown = await res.json()
  const cat = parseCatalog(raw)
  if (!cat) throw new Error('Catalog JSON did not match expected schema')
  return toNftRows(cat)
}

// ─── Hook (module-level network branch, safe for hook rules) ──────────────────

const IS_MAINNET = NETWORK.id === 5042

export function useNfts() {
  return useQuery({
    queryKey: IS_MAINNET ? ['catalog-nfts-mainnet'] : ['arcscan-nfts'],
    queryFn: IS_MAINNET ? loadNftsMainnet : loadNftsTestnet,
    staleTime: 5 * 60_000,
    retry: 2,
  })
}
