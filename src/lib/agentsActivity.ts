/**
 * Pure helpers for the agents-activity.json document published by the
 * Pulsarc indexer.  No React, no DOM.  Safe to run with:
 *   node --experimental-strip-types src/lib/agentsActivity.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentsActivity {
  network: string
  generatedAt: string
  totalAgents: number
  owners: number
  ownersMeasured: number
  agentsMeasured: number
  ownersWithTx: number
  ownersWithUsdc: number
  agentsOfOwnersWithoutTx: number
  top: {
    owner: string
    agents: number
    txCount: number
    usdc: number
    firstId: number
    names: string[]
  }[]
}

// ---------------------------------------------------------------------------
// Validation helpers (private)
// ---------------------------------------------------------------------------

/** Returns true when v is a finite number >= 0 AND is an integer. */
function isFiniteNonNegInt(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    isFinite(v) &&
    v >= 0 &&
    Math.floor(v) === v
  )
}

/** Returns true when v is a finite number >= 0 (not necessarily integer). */
function isFiniteNonNeg(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 0
}

const OWNER_RE = /^0x[0-9a-f]{40}$/

/** Strip control characters (U+0000–U+001F and U+007F) from a string. */
function stripControl(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]/g, '')
}

// ---------------------------------------------------------------------------
// parseAgentsActivity
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a raw agents-activity.json payload.
 *
 * - Returns null when the top-level shape is invalid.
 * - Malformed `top` entries are silently dropped; valid entries preserve the
 *   source-document order.
 * - Names are cut to 60 chars, have control characters removed, and are
 *   capped at 3 per entry.
 */
export function parseAgentsActivity(raw: unknown): AgentsActivity | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null

  const r = raw as Record<string, unknown>

  if (typeof r.network !== 'string') return null
  if (typeof r.generatedAt !== 'string') return null
  if (!isFiniteNonNegInt(r.totalAgents)) return null
  if (!isFiniteNonNegInt(r.owners)) return null
  if (!isFiniteNonNegInt(r.ownersMeasured)) return null
  if (!isFiniteNonNegInt(r.agentsMeasured)) return null
  if (!isFiniteNonNegInt(r.ownersWithTx)) return null
  if (!isFiniteNonNegInt(r.ownersWithUsdc)) return null
  if (!isFiniteNonNegInt(r.agentsOfOwnersWithoutTx)) return null

  // Cross-field constraints
  if ((r.ownersMeasured as number) > (r.owners as number)) return null
  if ((r.ownersWithTx as number) > (r.ownersMeasured as number)) return null

  // top: must be an array; bad entries are dropped
  const top: AgentsActivity['top'] = []
  if (Array.isArray(r.top)) {
    for (const item of r.top) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
      const e = item as Record<string, unknown>

      if (typeof e.owner !== 'string') continue
      if (!OWNER_RE.test(e.owner)) continue
      if (!isFiniteNonNegInt(e.agents)) continue
      if (!isFiniteNonNegInt(e.txCount)) continue
      if (!isFiniteNonNeg(e.usdc)) continue
      if (!isFiniteNonNegInt(e.firstId)) continue
      if (!Array.isArray(e.names)) continue

      // Validate and sanitise names
      const rawNames = e.names as unknown[]
      const names: string[] = []
      for (const n of rawNames) {
        if (typeof n !== 'string') continue
        const cleaned = stripControl(n).slice(0, 60)
        names.push(cleaned)
        if (names.length === 3) break
      }

      top.push({
        owner: e.owner,
        agents: e.agents as number,
        txCount: e.txCount as number,
        usdc: e.usdc as number,
        firstId: e.firstId as number,
        names,
      })
    }
  }

  return {
    network: r.network,
    generatedAt: r.generatedAt,
    totalAgents: r.totalAgents as number,
    owners: r.owners as number,
    ownersMeasured: r.ownersMeasured as number,
    agentsMeasured: r.agentsMeasured as number,
    ownersWithTx: r.ownersWithTx as number,
    ownersWithUsdc: r.ownersWithUsdc as number,
    agentsOfOwnersWithoutTx: r.agentsOfOwnersWithoutTx as number,
    top,
  }
}

// ---------------------------------------------------------------------------
// isActivityFresh
// ---------------------------------------------------------------------------

/**
 * Returns true when the document's generatedAt timestamp is within maxAgeMs
 * of `now`.  Treats an unparseable generatedAt as stale.
 * maxAgeMs defaults to 6 hours (the file refreshes about hourly).
 */
export function isActivityFresh(
  doc: AgentsActivity,
  now = Date.now(),
  maxAgeMs = 6 * 3_600_000,
): boolean {
  const ts = Date.parse(doc.generatedAt)
  if (!isFinite(ts)) return false
  return now - ts <= maxAgeMs
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

const numFmt = new Intl.NumberFormat('en-US')

function fmt(n: number): string {
  return numFmt.format(n)
}

export interface ActivitySummary {
  /** Always present: total agents and distinct owner count. */
  ownersLine: string
  /**
   * Only when ownersMeasured < owners: explains that only a subset was
   * measured (e.g. on testnet where there are too many owners to read all).
   */
  measuredLine: string | null
  /**
   * Only when at least one measured owner has never sent a transaction: how many measured owners have never sent
   * a transaction and how many agents they hold.
   */
  idleLine: string | null
}

export function summarize(doc: AgentsActivity): ActivitySummary {
  const ownerWord = doc.owners === 1 ? 'owner wallet' : 'owner wallets'
  const ownersLine = `${fmt(doc.totalAgents)} registered agents belong to ${fmt(doc.owners)} ${ownerWord}`

  const measuredLine =
    doc.ownersMeasured < doc.owners
      ? `Activity measured for the ${fmt(doc.ownersMeasured)} owners holding the most agents (${fmt(doc.agentsMeasured)} agents)`
      : null

  const idleLine =
    doc.ownersMeasured - doc.ownersWithTx > 0
      ? `${fmt(doc.ownersMeasured - doc.ownersWithTx)} of ${fmt(doc.ownersMeasured)} measured owners have never sent a transaction (${fmt(doc.agentsOfOwnersWithoutTx)} agents)`
      : null

  return { ownersLine, measuredLine, idleLine }
}

// ---------------------------------------------------------------------------
// shortOwner
// ---------------------------------------------------------------------------

/** Abbreviate a checksummed or lowercase address: `0x1234…abcd`. */
export function shortOwner(addr: string): string {
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`
}

// ---------------------------------------------------------------------------
// explorerAddressUrl
// ---------------------------------------------------------------------------

export function explorerAddressUrl(
  net: 'mainnet' | 'testnet',
  addr: string,
): string {
  if (net === 'mainnet') {
    return `https://explorer.arc.io/address/${addr}`
  }
  return `https://explorer.testnet.arc.io/address/${addr}`
}
