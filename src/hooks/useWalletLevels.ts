import { useQueries } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { buildLevels } from '@/lib/walletLevels'

export { HIGH_FREQUENCY } from '@/lib/walletLevels'

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
  const { levels, flagged } = buildLevels(addresses, queries.map(q => q?.data))
  return { levels, flagged, isLoading: queries.some(q => q.isLoading) }
}
