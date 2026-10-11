import { useQuery } from '@tanstack/react-query'
import type { LatestSnapshot } from '@/lib/networkHealth'
import { parseLatest } from '@/lib/networkHealth'

export type { LatestSnapshot } from '@/lib/networkHealth'
export { parseLatest, isLatestFresh, networkHealthCards, successRateSeries } from '@/lib/networkHealth'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * React-Query hook that fetches latest.json from the pulsarc-indexer data branch.
 * Returns null while loading, on network error, or when the response is not OK.
 */
export function useLatest(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['latest', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<LatestSnapshot | null> => {
      const res = await fetch(`${BASE}/${net}/latest.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseLatest(json)
    },
  })
}
