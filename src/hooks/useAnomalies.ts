import { useQuery } from '@tanstack/react-query'
import type { AnomaliesSnap } from '@/lib/anomalies'
import { parseAnomalies } from '@/lib/anomalies'

export type { AnomaliesSnap, AnomalyItem, AnomalyKind } from '@/lib/anomalies'
export { parseAnomalies, isAnomaliesFresh, describeAnomaly } from '@/lib/anomalies'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * React-Query hook that fetches the anomalies snapshot published by the
 * pulsarc-indexer GitHub Action.
 *
 * Returns null while loading, on network error, or when the response is not OK.
 */
export function useAnomalies(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['anomalies', net],
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<AnomaliesSnap | null> => {
      const res = await fetch(`${BASE}/${net}/anomalies.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseAnomalies(json)
    },
  })
}
