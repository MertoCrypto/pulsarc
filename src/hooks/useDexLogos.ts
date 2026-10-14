import { useQuery } from '@tanstack/react-query'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'
import { parseDexLogos } from '@/lib/dexLogos'
import { NETWORK } from '@/lib/chain'

const LOGOS_URL =
  'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/logos.json'

/** One hour in milliseconds. */
const STALE_TIME = 60 * 60 * 1000

/**
 * Fetches the DexScreener logo map for unverified Arc Mainnet tokens.
 * Only enabled on mainnet (NETWORK.id === 5042).
 * Returns a Record<address, imageId>; on 404 or any error returns {}.
 * Never enters an error state — callers always receive a (possibly empty) map.
 */
export function useDexLogos(): Record<string, string> {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['dexLogos', NETWORK.id],
    enabled: NETWORK.id === 5042,
    staleTime: STALE_TIME,
    retry: false,
    queryFn: async () => {
      try {
        const res = await fetchWithTimeout(LOGOS_URL)
        if (!res.ok) return {}
        const json: unknown = await res.json()
        return parseDexLogos(json)
      } catch {
        return {}
      }
    },
  })
  return data ?? {}
}
