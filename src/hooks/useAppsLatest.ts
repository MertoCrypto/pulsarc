import { useQuery } from '@tanstack/react-query'

// Re-export all pure types and functions from the library module so callers
// can import everything from one place.
export type {
  AppWindowStats,
  AppsLatest,
  AppMetricsPatch,
} from '@/lib/appsLatest'

export {
  parseAppsLatest,
  getAppWindow,
  windowsDiffer,
  isFresh,
  toAppMetricsPatch,
} from '@/lib/appsLatest'

import type { AppsLatest } from '@/lib/appsLatest'
import { parseAppsLatest } from '@/lib/appsLatest'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * React-Query hook that fetches the per-app snapshot published by the
 * pulsarc-indexer GitHub Action.
 *
 * Returns null while loading, on network error, or when the file does not
 * exist yet (HTTP non-OK). Callers should guard with `windowsDiffer(snap)`
 * before trusting multi-window comparisons.
 */
export function useAppsLatest(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['apps-latest', net],
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<AppsLatest | null> => {
      const res = await fetch(`${BASE}/${net}/apps-latest.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseAppsLatest(json)
    },
  })
}
