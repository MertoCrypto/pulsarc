/**
 * Pure data-layer helpers for the pulsarc-indexer agents.json format.
 * No React, no network — safe in plain Node (--experimental-strip-types).
 *
 * All agent-provided text (name, description, uri) is UNTRUSTED.
 * We strip control characters, cap lengths, and only allow safe URI schemes.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentIndexEntry {
  id: number
  owner: string       // lowercase 0x… (validated)
  name?: string       // max 80 chars, control chars stripped
  description?: string // max 280 chars, control chars stripped
  /** Display URI — ipfs:// converted to https://ipfs.io/ipfs/X; others kept only if https:// */
  uri?: string
}

export interface AgentsIndex {
  network: 'mainnet' | 'testnet'
  generatedAt: string
  registry: string
  lastId: number
  caughtUp: boolean
  count: number
  agents: AgentIndexEntry[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OWNER_RE = /^0x[0-9a-f]{40}$/
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

// ── Text sanitisation ─────────────────────────────────────────────────────────

function sanitiseText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.replace(CTRL_RE, '').trim().slice(0, max)
  return s.length > 0 ? s : undefined
}

function sanitiseUri(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (s.startsWith('https://')) return s.slice(0, 512)
  if (s.startsWith('ipfs://')) {
    const cid = s.slice('ipfs://'.length).slice(0, 256)
    return cid.length > 0 ? `https://ipfs.io/ipfs/${cid}` : undefined
  }
  return undefined
}

// ── parseAgentsIndex ──────────────────────────────────────────────────────────

/**
 * Strict validation of the raw JSON from agents.json.
 * Returns null when the top-level structure is invalid.
 * Drops individual malformed agents silently.
 * Never throws.
 */
export function parseAgentsIndex(json: unknown): AgentsIndex | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const raw = json as Record<string, unknown>

    const network = raw['network']
    if (network !== 'mainnet' && network !== 'testnet') return null

    const generatedAt = raw['generatedAt']
    if (typeof generatedAt !== 'string' || generatedAt.length === 0) return null

    const registry = raw['registry']
    if (typeof registry !== 'string') return null

    const lastId = raw['lastId']
    if (typeof lastId !== 'number' || !Number.isInteger(lastId) || lastId < 0) return null

    const caughtUp = raw['caughtUp']
    if (typeof caughtUp !== 'boolean') return null

    const count = raw['count']
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null

    const rawAgents = raw['agents']
    if (!Array.isArray(rawAgents)) return null

    const agents: AgentIndexEntry[] = []
    for (const item of rawAgents) {
      const entry = parseAgentEntry(item)
      if (entry) agents.push(entry)
    }

    return { network, generatedAt, registry, lastId, caughtUp, count, agents }
  } catch {
    return null
  }
}

function parseAgentEntry(item: unknown): AgentIndexEntry | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const raw = item as Record<string, unknown>

  const id = raw['id']
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null

  // Normalise owner to lowercase before validating
  const ownerRaw = raw['owner']
  if (typeof ownerRaw !== 'string') return null
  const owner = ownerRaw.toLowerCase()
  if (!OWNER_RE.test(owner)) return null

  const name = sanitiseText(raw['name'], 80)
  const description = sanitiseText(raw['description'], 280)
  const uri = sanitiseUri(raw['uri'])

  return { id, owner, ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(uri !== undefined && { uri }) }
}

// ── searchAgents ──────────────────────────────────────────────────────────────

/**
 * Case-insensitive search over id (exact integer match when query is all digits),
 * name, description, and owner.
 */
export function searchAgents(agents: AgentIndexEntry[], query: string): AgentIndexEntry[] {
  const q = query.trim()
  if (q.length === 0) return agents
  const lower = q.toLowerCase()
  const asNum = /^\d+$/.test(q) ? parseInt(q, 10) : NaN
  return agents.filter(a => {
    if (!isNaN(asNum) && a.id === asNum) return true
    if (a.name?.toLowerCase().includes(lower)) return true
    if (a.description?.toLowerCase().includes(lower)) return true
    if (a.owner.toLowerCase().includes(lower)) return true
    return false
  })
}

// ── sortAgents ────────────────────────────────────────────────────────────────

export type AgentSortKey = 'newest' | 'oldest' | 'named'

/**
 * Returns a new sorted array without mutating the input.
 * newest: descending id; oldest: ascending id; named: agents with name first, then by descending id.
 */
export function sortAgents(agents: AgentIndexEntry[], key: AgentSortKey): AgentIndexEntry[] {
  const copy = [...agents]
  switch (key) {
    case 'newest':
      return copy.sort((a, b) => b.id - a.id)
    case 'oldest':
      return copy.sort((a, b) => a.id - b.id)
    case 'named':
      return copy.sort((a, b) => {
        const aN = a.name !== undefined ? 0 : 1
        const bN = b.name !== undefined ? 0 : 1
        if (aN !== bN) return aN - bN
        return b.id - a.id
      })
  }
}

// ── pageOf ────────────────────────────────────────────────────────────────────

/**
 * Returns one page of items (1-indexed page number).
 * Returns an empty array when page is out of range.
 */
export function pageOf<T>(items: T[], page: number, size: number): T[] {
  if (size <= 0 || page < 1) return []
  const start = (page - 1) * size
  return items.slice(start, start + size)
}
