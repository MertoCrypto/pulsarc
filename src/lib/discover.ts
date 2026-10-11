/**
 * Pure helpers for the /discover page.
 * No React, no network — safe for plain Node (--experimental-strip-types).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoverContract {
  address: string
  txs: number
  walletHours: number
  fees: number
}

export interface DiscoverSnapshot {
  network: 'mainnet' | 'testnet'
  generatedAt: string
  contracts: DiscoverContract[]
}

export interface ContractLabel {
  contract: boolean
  name: string | null
  symbol: string | null
  kind?: string
}

export interface DisplayContract {
  address: string
  /** Sanitised label name, capped at 40 chars; null means no label. */
  displayName: string | null
  txs: number
  walletHours: number
  fees: number
  /** share of network 24h txs (0–100), or null when networkTxs is 0. */
  networkShare: number | null
  /** True when the contract looks automated: txs >= 1000 AND txs/walletHours >= 50. */
  automatedLooking: boolean
}

// ── Validation helpers ────────────────────────────────────────────────────────

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function sanitiseName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  // Strip control characters (0x00-0x1f, 0x7f-0x9f) and trim
  const cleaned = raw.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim()
  if (cleaned.length === 0) return null
  // Cap at 40 chars
  return cleaned.slice(0, 40)
}

function parseDiscoverContract(raw: unknown): DiscoverContract | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r['address'] !== 'string') return null
  if (!isFiniteNum(r['txs']) || !isFiniteNum(r['walletHours']) || !isFiniteNum(r['fees'])) return null
  return {
    address: (r['address'] as string).toLowerCase(),
    txs: r['txs'] as number,
    walletHours: r['walletHours'] as number,
    fees: r['fees'] as number,
  }
}

// ── parseDiscover ─────────────────────────────────────────────────────────────

/**
 * Validates raw JSON from discover.json.
 * Returns null on anything malformed; never throws.
 */
export function parseDiscover(json: unknown): DiscoverSnapshot | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const raw = json as Record<string, unknown>

    const network = raw['network']
    if (network !== 'mainnet' && network !== 'testnet') return null

    const generatedAt = raw['generatedAt']
    if (typeof generatedAt !== 'string' || generatedAt.length === 0) return null

    const rawContracts = raw['contracts']
    if (!Array.isArray(rawContracts)) return null

    const contracts: DiscoverContract[] = []
    for (const item of rawContracts) {
      const c = parseDiscoverContract(item)
      if (c) contracts.push(c)
    }

    return { network: network as 'mainnet' | 'testnet', generatedAt, contracts }
  } catch {
    return null
  }
}

// ── buildDisplayList ──────────────────────────────────────────────────────────

/**
 * Joins discover.json contracts with labels.json, filters out tracked anchors,
 * computes display values, and returns the top `limit` entries sorted by txs desc.
 *
 * @param snap       Parsed discover.json (may be null).
 * @param labels     Parsed labels.json (may be null or empty).
 * @param trackedAddresses  Lowercased anchor addresses already in apps.ts.
 * @param networkTxs 24h total txs from latest.json windows['24h'].txs (for share).
 * @param limit      Max entries to return (default 30).
 */
export function buildDisplayList(
  snap: DiscoverSnapshot | null | undefined,
  labels: Record<string, ContractLabel> | null | undefined,
  trackedAddresses: Set<string>,
  networkTxs: number,
  limit = 30,
): DisplayContract[] {
  if (!snap) return []

  const safeLabels = labels ?? {}
  const result: DisplayContract[] = []

  for (const c of snap.contracts) {
    const addr = c.address.toLowerCase()
    if (trackedAddresses.has(addr)) continue

    const labelEntry = safeLabels[addr] ?? safeLabels[c.address] ?? null
    const displayName = labelEntry ? sanitiseName(labelEntry.name) : null

    const networkShare =
      networkTxs > 0 ? parseFloat(((c.txs / networkTxs) * 100).toFixed(2)) : null

    // Automated-looking: txs >= 1000 AND txs/walletHours >= 50
    // Guard against division by zero: walletHours === 0 → ratio is Infinity → treat as automated if txs >= 1000
    const ratio = c.walletHours === 0 ? Infinity : c.txs / c.walletHours
    const automatedLooking = c.txs >= 1000 && ratio >= 50

    result.push({ address: addr, displayName, txs: c.txs, walletHours: c.walletHours, fees: c.fees, networkShare, automatedLooking })
  }

  // Already sorted by txs desc from the indexer, but enforce it here
  result.sort((a, b) => b.txs - a.txs)
  return result.slice(0, limit)
}

// ── shortAddress ─────────────────────────────────────────────────────────────

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
