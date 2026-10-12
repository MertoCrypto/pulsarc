import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { toArcToken, type ArcToken, type RawToken } from '@/lib/tokens'

export { groupOf, type TokenGroup, type ArcToken } from '@/lib/tokens'

interface Page {
  items: RawToken[]
  next_page_params: Record<string, unknown> | null
}

const PAGES = 4 // 200 tokens, ordered by holders

async function loadTokens(): Promise<ArcToken[]> {
  const out: ArcToken[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < PAGES; i++) {
    const page: Page = await arcscan<Page>('/tokens', { type: 'ERC-20', ...(cursor ?? {}) })
    for (const t of page.items) {
      out.push(toArcToken(t))
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
