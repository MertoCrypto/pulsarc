/**
 * useTokens — data hook for the Tokens page.
 *
 * NETWORK SELECTION (module-level, safe for the React hook rule):
 * On Arc Mainnet (NETWORK.id === 5042) the hook fetches from the indexer catalog
 * instead of ArcScan. The catalog URL is hardcoded here rather than built from a
 * network parameter because it is a GitHub raw-content URL specific to the mainnet
 * indexer job and has no testnet equivalent.
 *
 * useChainOverview is testnet-only (ArcScan /stats); on mainnet it is not called.
 */
import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { mergeTokenSources, toArcToken, type ArcToken, type RawToken } from '@/lib/tokens'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'
import { parseCatalog, toTokenRows } from '@/lib/catalog'
import { NETWORK } from '@/lib/chain'

export { groupOf, type TokenGroup, type ArcToken } from '@/lib/tokens'

// ─── Shared: ArcScan paged token load ────────────────────────────────────────

interface Page {
  items: RawToken[]
  next_page_params: Record<string, unknown> | null
}

/**
 * Load up to `pages` pages of ERC-20 tokens from ArcScan sequentially.
 * A failing page after the first stops pagination but keeps what was already read.
 * @throws when the very first page fails (so caller can fall back).
 */
async function loadTokensFromArcscan(pages: number): Promise<ArcToken[]> {
  const out: ArcToken[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < pages; i++) {
    // First page throws — lets the caller decide to fall back.
    // Later pages: swallow the error and return what was read so far.
    let page: Page
    try {
      page = await arcscan<Page>('/tokens', { type: 'ERC-20', ...(cursor as Record<string, string | number | boolean | null | undefined> ?? {}) })
    } catch (err) {
      if (i === 0) throw err  // re-throw so caller can fall back
      break                   // later page failed — keep partial results
    }
    for (const t of page.items) {
      out.push(toArcToken(t))
    }
    cursor = page.next_page_params
    if (!cursor) break
  }
  return out
}

// Testnet: top 200 tokens by ArcScan default order (holders).
const TESTNET_PAGES = 4

async function loadTokensTestnet(): Promise<ArcToken[]> {
  return loadTokensFromArcscan(TESTNET_PAGES)
}

// ─── Mainnet: ArcScan paged load with catalog fallback ───────────────────────

// ~600 tokens: ArcScan returns 50 per page, so 12 pages.
const MAINNET_PAGES = 12

// Hardcoded: this URL belongs to the mainnet indexer job specifically.
// There is no testnet catalog at this repository path.
const MAINNET_CATALOG_URL =
  'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/catalog.json'

async function loadTokensFromCatalog(): Promise<ArcToken[]> {
  const res = await fetchWithTimeout(MAINNET_CATALOG_URL)
  if (res.status === 404) {
    // Catalog not yet produced — return empty list; UI shows building state.
    return []
  }
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`)
  const raw: unknown = await res.json()
  const cat = parseCatalog(raw)
  if (!cat) throw new Error('Catalog JSON did not match expected schema')
  return toTokenRows(cat)
}

async function loadTokensMainnet(): Promise<ArcToken[]> {
  try {
    // Attempt ArcScan first — returns volume, holders, market cap live data.
    // loadTokensFromArcscan throws on the first-page failure; subsequent page
    // failures are swallowed internally and return whatever was read so far.
    const scanned = await loadTokensFromArcscan(MAINNET_PAGES)
    // ArcScan's list leaves out some tokens the indexer knows (USYC, for one); add those so
    // verified tokens are never missing. ArcScan rows win on overlap (they carry the market data).
    const known = await loadTokensFromCatalog().catch(() => [] as ArcToken[])
    return mergeTokenSources(scanned, known)
  } catch {
    // First ArcScan page failed — fall back to the indexer catalog.
    // Catalog tokens lack volume/holders/marketCap but always have supply.
    return loadTokensFromCatalog()
  }
}

// ─── Hook (module-level network branch, safe for hook rules) ──────────────────

const IS_MAINNET = NETWORK.id === 5042

export function useTokens() {
  return useQuery({
    queryKey: IS_MAINNET ? ['catalog-tokens-mainnet'] : ['arcscan-tokens'],
    queryFn: IS_MAINNET ? loadTokensMainnet : loadTokensTestnet,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 2,
  })
}

// ─── Catalog metadata (mainnet only) ─────────────────────────────────────────

export interface CatalogMeta {
  coverage: string
  generatedAt: string
}

async function loadCatalogMeta(): Promise<CatalogMeta | null> {
  const res = await fetchWithTimeout(MAINNET_CATALOG_URL)
  if (!res.ok) return null
  const raw: unknown = await res.json()
  const cat = parseCatalog(raw)
  if (!cat) return null
  return { coverage: cat.coverage, generatedAt: cat.generatedAt }
}

export function useCatalogMeta() {
  return useQuery({
    queryKey: ['catalog-meta-mainnet'],
    queryFn: loadCatalogMeta,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    enabled: IS_MAINNET,
    retry: 1,
  })
}

// ─── Chain overview (testnet only) ───────────────────────────────────────────

export interface ChainOverview {
  totalAddresses: number
  totalTransactions: number
  transactionsToday: number
  totalBlocks: number
  networkUtilization: number
}

interface RawStats {
  total_addresses: string
  total_transactions: string
  transactions_today: string
  total_blocks: string
  network_utilization_percentage: number
}

export function useChainOverview() {
  return useQuery({
    queryKey: ['arcscan-stats'],
    queryFn: async (): Promise<ChainOverview> => {
      const s = await arcscan<RawStats>('/stats')
      return {
        totalAddresses: Number(s.total_addresses),
        totalTransactions: Number(s.total_transactions),
        transactionsToday: Number(s.transactions_today),
        totalBlocks: Number(s.total_blocks),
        networkUtilization: s.network_utilization_percentage,
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: !IS_MAINNET,
  })
}
