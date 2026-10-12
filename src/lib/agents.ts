/** Pure mapping of ERC-8004 identity registry tokens to display-safe agents. Metadata is untrusted. */

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

export interface RawInstance {
  id: string
  owner: { hash: string }
  metadata: Record<string, unknown> | null
}

// Agent metadata is written by whoever registers the agent — treat every field as untrusted text.
const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export function toAgent(i: RawInstance): Agent {
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
