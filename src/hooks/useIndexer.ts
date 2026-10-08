import { useQuery } from '@tanstack/react-query'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

export interface IndexedContract {
  address: string
  txs: number
  /** sum of distinct wallets per hour — an upper bound on distinct wallets */
  walletHours: number
  fees: number
}

export interface IndexedWindow {
  hours: number
  blocks: number
  txs: number
  failed: number
  fees: number
  walletHours: number
  top: IndexedContract[]
}

export interface ContractLabel {
  contract: boolean
  name: string | null
  symbol: string | null
  kind?: string
}

export interface IndexerSnapshot {
  labels: Record<string, ContractLabel>
  network: 'mainnet' | 'testnet'
  generatedAt: string
  windows: Record<'1h' | '24h' | '7d', IndexedWindow>
  series: { hour: string; txs: number; failed: number; fees: number; wallets: number; blocks: number }[]
}

/** Hourly aggregates built by the pulsarc-indexer Action; null while it has not published yet. */
export function useIndexer(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['indexer', net],
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<IndexerSnapshot | null> => {
      const res = await fetch(`${BASE}/${net}/latest.json`)
      if (!res.ok) return null
      const snap = (await res.json()) as Omit<IndexerSnapshot, 'labels'>
      // labels are optional: the table falls back to addresses until they exist
      const labels = await fetch(`${BASE}/${net}/labels.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
      return { ...snap, labels } as IndexerSnapshot
    },
  })
}
