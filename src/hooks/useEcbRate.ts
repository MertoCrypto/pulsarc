import { useQuery } from '@tanstack/react-query'
import { parseEcbRate, ecbRangeUrl, isEcbFresh, type EcbRate } from '@/lib/ecbRate'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

/** Euro reference rate (ECB via Frankfurter), last 30 days. Null when unavailable or stale. */
export function useEcbRate(enabled: boolean) {
  return useQuery<EcbRate | null>({
    queryKey: ['ecb-rate'],
    enabled,
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: async (): Promise<EcbRate | null> => {
      const res = await fetchWithTimeout(ecbRangeUrl(new Date()))
      if (!res.ok) throw new Error(`ecb rate fetch failed: ${res.status}`)
      const rate = parseEcbRate(await res.json())
      return rate && isEcbFresh(rate) ? rate : null
    },
  })
}
