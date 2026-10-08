import { useQuery } from '@tanstack/react-query'
import { arcscan, scaled } from '@/lib/arcscan'

export type TokenGroup = 'Stablecoin' | 'RWA' | 'LP & Vaults' | 'Other'

export interface ArcToken {
  address: string
  name: string
  symbol: string
  decimals: number
  holders: number
  supply: number
  group: TokenGroup
  iconUrl: string | null
}

interface RawToken {
  address_hash: string
  name: string | null
  symbol: string | null
  decimals: string | null
  holders_count: string | null
  total_supply: string | null
  icon_url: string | null
}

interface Page {
  items: RawToken[]
  next_page_params: Record<string, unknown> | null
}

const PAGES = 4 // 200 tokens, ordered by holders

const STABLE = /^(w|a|x)?(usdc|eurc|usdt)(\.a)?$/i

/** Our own labels, derived from names. ArcScan does not classify tokens. */
export function groupOf(name: string, symbol: string): TokenGroup {
  if (/^usyc$/i.test(symbol)) return 'RWA'
  if (STABLE.test(symbol) || /^(circle )?(usd coin|euro coin)$/i.test(name)) return 'Stablecoin'
  if (/\blp\b|-lp|lp$|vault|gauge|staked|pool/i.test(`${name} ${symbol}`)) return 'LP & Vaults'
  return 'Other'
}

async function loadTokens(): Promise<ArcToken[]> {
  const out: ArcToken[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < PAGES; i++) {
    const page: Page = await arcscan<Page>('/tokens', { type: 'ERC-20', ...(cursor ?? {}) })
    for (const t of page.items) {
      const decimals = Number(t.decimals ?? 0)
      out.push({
        address: t.address_hash,
        name: t.name ?? 'Unnamed',
        symbol: t.symbol ?? '—',
        decimals,
        holders: Number(t.holders_count ?? 0),
        supply: scaled(t.total_supply, decimals),
        group: groupOf(t.name ?? '', t.symbol ?? ''),
        iconUrl: t.icon_url,
      })
    }
    cursor = page.next_page_params
    if (!cursor) break
  }
  return out
}

export function useTokens() {
  return useQuery({
    queryKey: ['arcscan-tokens'],
    queryFn: loadTokens,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 2,
  })
}

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
  })
}
