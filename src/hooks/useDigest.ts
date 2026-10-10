import { useQuery } from '@tanstack/react-query'
import type { DigestSnap } from '@/lib/digest'
import { parseDigest } from '@/lib/digest'

export type { DigestSnap, DigestOk, DigestWarmingUp, DigestApp } from '@/lib/digest'
export { parseDigest, progress, formatChange } from '@/lib/digest'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * React-Query hook that fetches the weekly digest published by the
 * pulsarc-indexer GitHub Action.
 *
 * Returns null while loading, on network error, or when the response is not OK.
 */
export function useDigest(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['digest', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<DigestSnap | null> => {
      const res = await fetch(`${BASE}/${net}/digest-latest.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseDigest(json)
    },
  })
}
