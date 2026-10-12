import { useQuery } from '@tanstack/react-query'
import { parseFx, type FxDoc } from '@/lib/fx'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * Fetch and parse fx.json for the given network.
 *
 * - 404 responses return null (mainnet has no source — a 404 there is normal).
 * - Other non-OK responses throw so react-query can retry.
 * - Unparseable payloads return null.
 */
export function useFx(net: 'mainnet' | 'testnet') {
  return useQuery<FxDoc | null>({
    queryKey: ['fx', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<FxDoc | null> => {
      const res = await fetchWithTimeout(`${BASE}/${net}/fx.json`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`fx.json fetch failed: ${res.status}`)
      const json: unknown = await res.json()
      return parseFx(json)
    },
  })
}
