import { useQuery } from '@tanstack/react-query'
import type { DiscoverSnapshot, ContractLabel } from '@/lib/discover'
import { parseDiscover } from '@/lib/discover'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

export type { DiscoverSnapshot, ContractLabel, DisplayContract } from '@/lib/discover'
export { parseDiscover, buildDisplayList, shortAddress } from '@/lib/discover'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

interface DiscoverData {
  snap: DiscoverSnapshot
  labels: Record<string, ContractLabel>
}

/**
 * React-Query hook that fetches discover.json and labels.json.
 * Returns null on any failure.
 */
export function useDiscover(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['discover', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<DiscoverData | null> => {
      const [discoverRes, labelsRes] = await Promise.all([
        fetchWithTimeout(`${BASE}/${net}/discover.json`),
        fetchWithTimeout(`${BASE}/${net}/labels.json`),
      ])
      if (!discoverRes.ok) return null
      const discoverJson: unknown = await discoverRes.json()
      const snap = parseDiscover(discoverJson)
      if (!snap) return null

      let labels: Record<string, ContractLabel> = {}
      if (labelsRes.ok) {
        try {
          labels = (await labelsRes.json()) as Record<string, ContractLabel>
        } catch {
          // labels are optional
        }
      }

      return { snap, labels }
    },
  })
}
