import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { toAgent, type Agent, type RawInstance } from '@/lib/agents'

export const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
export const VALIDATION_REGISTRY = '0x8004Cb1BF31DAf7788923b405b754f57acEB4272'
export const AGENTIC_COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583'

export type { Agent, AgentService } from '@/lib/agents'

interface Page { items: RawInstance[]; next_page_params: Record<string, unknown> | null }
interface TokenCounters { transfers_count: string; token_holders_count: string }
interface AddrCounters { transactions_count: string }

async function load() {
  const [identity, validation, commerce, registry] = await Promise.all([
    arcscan<TokenCounters>(`/tokens/${IDENTITY_REGISTRY}/counters`),
    arcscan<AddrCounters>(`/addresses/${VALIDATION_REGISTRY}/counters`),
    arcscan<AddrCounters>(`/addresses/${AGENTIC_COMMERCE}/counters`),
    (async () => {
      const agents: Agent[] = []
      let cursor: Record<string, unknown> | null = null
      for (let i = 0; i < 3; i++) {
        const page: Page = await arcscan<Page>(`/tokens/${IDENTITY_REGISTRY}/instances`, cursor ?? undefined)
        agents.push(...page.items.map(toAgent))
        cursor = page.next_page_params
        if (!cursor) break
      }
      return agents
    })(),
  ])

  return {
    agents: registry,
    newestId: registry.length ? Math.max(...registry.map(a => Number(a.id))) : 0,
    owners: Number(identity.token_holders_count),
    identityTransfers: Number(identity.transfers_count),
    validationTxs: Number(validation.transactions_count),
    commerceTxs: Number(commerce.transactions_count),
  }
}

export function useAgents() {
  return useQuery({ queryKey: ['arcscan-agents'], queryFn: load, staleTime: 2 * 60_000, retry: 2 })
}
