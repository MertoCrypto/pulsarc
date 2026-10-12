import { useQuery } from '@tanstack/react-query'
import { parseBalances, type BalancesDoc } from '@/lib/balances'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * Fetch and parse balances.json for the given network.
 *
 * - 404 responses return null (a missing file is treated as "no data yet").
 * - Other non-OK responses throw so react-query can retry.
 * - Unparseable payloads return null.
 */
export function useBalances(net: 'mainnet' | 'testnet') {
  return useQuery<BalancesDoc | null>({
    queryKey: ['balances', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<BalancesDoc | null> => {
      const res = await fetch(`${BASE}/${net}/balances.json`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`balances.json fetch failed: ${res.status}`)
      const json: unknown = await res.json()
      return parseBalances(json)
    },
  })
}
