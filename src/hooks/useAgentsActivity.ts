import { useQuery } from '@tanstack/react-query'
import { parseAgentsActivity, type AgentsActivity } from '@/lib/agentsActivity'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * Fetch and parse agents-activity.json for the given network.
 *
 * - 404 responses return null (a missing file is treated as "no data yet").
 * - Other non-OK responses throw so react-query can retry.
 * - Unparseable payloads return null.
 */
export function useAgentsActivity(net: 'mainnet' | 'testnet') {
  return useQuery<AgentsActivity | null>({
    queryKey: ['agentsActivity', net],
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
    queryFn: async (): Promise<AgentsActivity | null> => {
      const res = await fetch(`${BASE}/${net}/agents-activity.json`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`agents-activity.json fetch failed: ${res.status}`)
      const json: unknown = await res.json()
      return parseAgentsActivity(json)
    },
  })
}
