import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'

export interface DailyPoint {
  date: string // YYYY-MM-DD
  label: string
  transactions: number
}

interface Raw { chart_data: { date: string; transactions_count: number }[] }

/** Chain-wide transactions per day from ArcScan's own chart data (oldest first). */
export function useChainDaily() {
  return useQuery({
    queryKey: ['arcscan-daily-tx'],
    queryFn: async (): Promise<DailyPoint[]> => {
      const raw = await arcscan<Raw>('/stats/charts/transactions')
      return raw.chart_data
        .map(p => {
          const [, m, d] = p.date.split('-')
          return { date: p.date, label: `${Number(m)}/${Number(d)}`, transactions: p.transactions_count }
        })
        .sort((a, b) => a.date.localeCompare(b.date))
    },
    staleTime: 10 * 60_000,
  })
}
