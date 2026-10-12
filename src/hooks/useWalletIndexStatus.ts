/**
 * React Query hook for the Pulsarc wallet index status.
 * Fetches meta.json from the wallets-<net> branch of the pulsarc-indexer repo.
 *   - 404  → returns null (index not published yet); card hides itself.
 *   - non-OK → throws so react-query retries once.
 *   - Invalid shape → null.
 */

import { useQuery } from '@tanstack/react-query'
import { parseMeta } from '@/lib/walletIndex'
import { indexStatus, type IndexStatusResult } from '@/lib/walletIndexStatus'

type Net = 'mainnet' | 'testnet'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer'

function metaUrl(net: Net): string {
  return `${BASE}/wallets-${net}/meta.json`
}

export function useWalletIndexStatus(net: Net): {
  status: IndexStatusResult | null
  isLoading: boolean
} {
  const query = useQuery<IndexStatusResult | null>({
    queryKey: ['wallet-index-status', net],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<IndexStatusResult | null> => {
      const res = await fetch(metaUrl(net))
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`)
      const raw: unknown = await res.json()
      const meta = parseMeta(raw)
      if (meta === null) return null
      return indexStatus(meta, Date.now())
    },
  })

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
  }
}
