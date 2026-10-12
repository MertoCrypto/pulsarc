/**
 * useDataFreshness — fetches every checked catalog file for the given network
 * and classifies its freshness.
 *
 * Wire into your component:
 *   import { useDataFreshness } from '@/hooks/useDataFreshness'
 *   const { rows, isLoading } = useDataFreshness('testnet')
 */

import { useQueries } from '@tanstack/react-query'
import { CATALOG, catalogUrl, type CatalogEntry } from '@/lib/dataCatalog'
import { classify, rowsToCheck, type FreshState, timestampOf } from '@/lib/dataFreshness'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

export interface FreshnessRow {
  file: string
  title: string
  state: FreshState
  ageMin: number | null
}

interface UseDataFreshnessResult {
  rows: FreshnessRow[]
  isLoading: boolean
}

const REFETCH_INTERVAL = 5 * 60_000   // 5 minutes
const STALE_TIME = 60_000             // 60 seconds

/**
 * One query per catalog file that belongs to `net` and has a MAX_AGE_MIN
 * entry.  Each query:
 *  - fetches with cache: 'no-store'
 *  - treats 404 as {status: 404}
 *  - treats other non-OK as {status: <code>}
 *  - treats network error as {status: 'error'}
 *  - reads generatedAt from the JSON body (JSON files only)
 */
export function useDataFreshness(net: 'mainnet' | 'testnet'): UseDataFreshnessResult {
  const entries = rowsToCheck(CATALOG, net)

  const results = useQueries({
    queries: entries.map(entry => ({
      queryKey: ['data-freshness', net, entry.file] as const,
      staleTime: STALE_TIME,
      refetchInterval: REFETCH_INTERVAL,
      retry: 0,
      queryFn: async (): Promise<{
        status: number | 'error'
        generatedAt: unknown
      }> => {
        const url = catalogUrl(
          // catalogUrl needs a full CatalogEntry; find it in CATALOG
          CATALOG.find((c: CatalogEntry) => c.file === entry.file)!,
          net,
        )

        let res: Response
        try {
          res = await fetchWithTimeout(url, { cache: 'no-store' })
        } catch {
          return { status: 'error', generatedAt: undefined }
        }

        if (res.status === 404) {
          return { status: 404, generatedAt: undefined }
        }

        if (!res.ok) {
          return { status: res.status, generatedAt: undefined }
        }

        // Only attempt JSON parse for .json files
        if (entry.file.endsWith('.json')) {
          try {
            const json = (await res.json()) as Record<string, unknown>
            return { status: res.status, generatedAt: timestampOf(json) }
          } catch {
            return { status: res.status, generatedAt: undefined }
          }
        }

        return { status: res.status, generatedAt: undefined }
      },
    })),
  })

  const isLoading = results.some(r => r.isLoading)

  const rows: FreshnessRow[] = entries.map((entry, i) => {
    const result = results[i]
    if (!result || result.isLoading || result.data === undefined) {
      return { file: entry.file, title: entry.title, state: 'unknown' as FreshState, ageMin: null }
    }
    const { status, generatedAt } = result.data
    const { state, ageMin } = classify(entry.file, status, generatedAt)
    return { file: entry.file, title: entry.title, state, ageMin }
  })

  return { rows, isLoading }
}
