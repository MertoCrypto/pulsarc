import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { toDailyPoints, type DailyPoint, type RawDaily } from '@/lib/chainDaily'
import { hourlyToDaily } from '@/lib/hourlyToDaily'
import { NETWORK } from '@/lib/chain'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

export type { DailyPoint } from '@/lib/chainDaily'

// ── Mainnet indexer ────────────────────────────────────────────────────────

const INDEXER_URL =
  'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/latest.json'

const FETCH_TIMEOUT_MS = 10_000

interface IndexerSeries {
  hour: string
  txs: number
  [key: string]: unknown
}

interface IndexerLatest {
  series: IndexerSeries[]
}

function dayLabel(isoDay: string): string {
  const [, m, d] = isoDay.split('-')
  return `${Number(m)}/${Number(d)}`
}

async function fetchIndexerDaily(): Promise<DailyPoint[]> {
  const res = await fetchWithTimeout(INDEXER_URL, undefined, FETCH_TIMEOUT_MS)
  if (!res.ok) throw new Error(`Indexer latest.json → ${res.status}`)
  const json = (await res.json()) as IndexerLatest
  const buckets = hourlyToDaily(json.series ?? [])
  return buckets.map(b => ({
    date: b.day,
    label: dayLabel(b.day),
    transactions: b.txs,
    partial: b.partial || undefined,  // omit false so testnet shape is unaffected
  }))
}

// ── Hook ───────────────────────────────────────────────────────────────────

const IS_MAINNET = NETWORK.id === 5042

/** Chain-wide transactions per day (oldest first).
 *
 * • On testnet: queries ArcScan's /stats/charts/transactions — unchanged behaviour.
 * • On mainnet: fetches the indexer's hourly series and collapses it to daily
 *   buckets.  The query key differs so the two caches never overlap.
 */
export function useChainDaily() {
  return useQuery(
    IS_MAINNET
      ? {
          queryKey: ['indexer-daily-tx', 'mainnet'],
          queryFn: fetchIndexerDaily,
          staleTime: 10 * 60_000,
        }
      : {
          queryKey: ['arcscan-daily-tx'],
          queryFn: async (): Promise<DailyPoint[]> => {
            const raw = await arcscan<RawDaily>('/stats/charts/transactions')
            return toDailyPoints(raw)
          },
          staleTime: 10 * 60_000,
        },
  )
}
