import { useQuery } from '@tanstack/react-query'
import type { AgentsIndex } from '@/lib/agentsIndex'
import { parseAgentsIndex } from '@/lib/agentsIndex'

export type { AgentsIndex, AgentIndexEntry, AgentSortKey } from '@/lib/agentsIndex'
export { parseAgentsIndex, searchAgents, sortAgents, pageOf } from '@/lib/agentsIndex'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * React-Query hook that fetches the full registered-agents list published by
 * the pulsarc-indexer GitHub Action.
 *
 * Returns null on non-OK responses or when the file is malformed.
 * staleTime 5 min / refetchInterval 10 min — the file is ~0.5 MB so we fetch
 * sparingly.
 */
export function useAgentsIndex(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['agents-index', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<AgentsIndex | null> => {
      const res = await fetch(`${BASE}/${net}/agents.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseAgentsIndex(json)
    },
  })
}
