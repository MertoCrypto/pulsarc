import { useQuery } from '@tanstack/react-query'
import type { IndexerState, AppsLatestMeta } from '@/lib/status'
import { parseState } from '@/lib/status'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

export type { IndexerState, AppsLatestMeta, StatusDerived, WindowCoverage } from '@/lib/status'
export { parseState, deriveStatus, timeAgo } from '@/lib/status'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * React-Query hook that fetches state.json and apps-latest.json (for coverageHours)
 * from the pulsarc-indexer data branch.
 */
export function useIndexerState(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['indexer-state', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<{ state: IndexerState; meta: AppsLatestMeta } | null> => {
      const [stateRes, metaRes] = await Promise.all([
        fetchWithTimeout(`${BASE}/${net}/state.json`),
        fetchWithTimeout(`${BASE}/${net}/apps-latest.json`),
      ])
      if (!stateRes.ok) return null
      const stateJson: unknown = await stateRes.json()
      const state = parseState(stateJson)
      if (!state) return null

      let meta: AppsLatestMeta = {}
      if (metaRes.ok) {
        try {
          const metaJson = (await metaRes.json()) as Record<string, unknown>
          if (typeof metaJson['coverageHours'] === 'number') {
            meta = { coverageHours: metaJson['coverageHours'] as number }
          }
        } catch {
          // meta is optional
        }
      }

      return { state, meta }
    },
  })
}
