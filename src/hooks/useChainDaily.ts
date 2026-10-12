import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { toDailyPoints, type DailyPoint, type RawDaily } from '@/lib/chainDaily'

export type { DailyPoint } from '@/lib/chainDaily'

/** Chain-wide transactions per day from ArcScan's own chart data (oldest first). */
export function useChainDaily() {
  return useQuery({
    queryKey: ['arcscan-daily-tx'],
    queryFn: async (): Promise<DailyPoint[]> => {
      const raw = await arcscan<RawDaily>('/stats/charts/transactions')
      return toDailyPoints(raw)
    },
    staleTime: 10 * 60_000,
  })
}
