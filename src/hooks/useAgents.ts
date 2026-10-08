import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'

export const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
export const VALIDATION_REGISTRY = '0x8004Cb1BF31DAf7788923b405b754f57acEB4272'
export const AGENTIC_COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583'

export interface AgentService { name: string; endpoint: string }

export interface Agent {
  id: string
  owner: string
  name: string | null
  description: string | null
  active: boolean | null
  x402: boolean
  tags: string[]
  services: AgentService[]
}

interface RawInstance {
  id: string
  owner: { hash: string }
  metadata: Record<string, unknown> | null
}
interface Page { items: RawInstance[]; next_page_params: Record<string, unknown> | null }
interface TokenCounters { transfers_count: string; token_holders_count: string }
interface AddrCounters { transactions_count: string }

// Agent metadata is written by whoever registers the agent — treat every field as untrusted text.
const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

function toAgent(i: RawInstance): Agent {
  const m = i.metadata ?? {}
  const services = Array.isArray(m.services) ? m.services : []
  const tags = Array.isArray(m.tags) ? m.tags : []
  return {
    id: i.id,
    owner: i.owner.hash,
    name: text(m.name, 80),
    description: text(m.description, 280),
    active: typeof m.active === 'boolean' ? m.active : null,
    x402: m.x402Support === true,
    tags: tags.flatMap(t => (typeof t === 'string' ? [t.slice(0, 24)] : [])).slice(0, 5),
    services: services
      .flatMap((s: unknown) => {
        const o = (s ?? {}) as Record<string, unknown>
        const name = text(o.name, 40)
        return name ? [{ name, endpoint: text(o.endpoint, 90) ?? '' }] : []
      })
      .slice(0, 4),
  }
}

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
