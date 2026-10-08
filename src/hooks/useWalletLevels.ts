import { useQueries } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'

/** A wallet with this many lifetime transactions is treated as automated (bot / keeper / faucet loop). */
export const HIGH_FREQUENCY = 10_000

interface Counters { transactions_count: string }

/** Lifetime transaction counts for a few wallets, from ArcScan. */
export function useWalletLevels(addresses: string[]) {
  const queries = useQueries({
    queries: addresses.map(a => ({
      queryKey: ['wallet-level', a.toLowerCase()],
      queryFn: async () => Number((await arcscan<Counters>(`/addresses/${a}/counters`)).transactions_count),
      staleTime: 10 * 60_000,
      retry: 1,
    })),
  })
  const levels = new Map<string, number>()
  addresses.forEach((a, i) => { const v = queries[i]?.data; if (v !== undefined) levels.set(a.toLowerCase(), v) })
  const flagged = new Set([...levels].filter(([, n]) => n >= HIGH_FREQUENCY).map(([a]) => a))
  return { levels, flagged, isLoading: queries.some(q => q.isLoading) }
}
