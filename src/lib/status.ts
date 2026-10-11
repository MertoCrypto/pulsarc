/**
 * Pure helpers for the /status page.
 * No React, no network — safe for plain Node (--experimental-strip-types).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IndexerState {
  next: number
  tip: number
  network: 'mainnet' | 'testnet'
  chainId: number
  openHour: string | null
  openHourStart: number | null
  skipped: [number, number][]
  updatedAt: string
}

export interface AppsLatestMeta {
  coverageHours?: number
}

export interface WindowCoverage {
  window: '1h' | '24h' | '7d'
  source: 'indexer' | 'arcscan'
  requiredHours: number
}

export interface StatusDerived {
  lastIndexedBlock: number
  tip: number
  lagBlocks: number
  updatedAt: string
  updatedAgoMs: number
  isStale: boolean
  openHour: string | null
  skipped: { from: number; to: number; count: number }[]
  coverage: WindowCoverage[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function parseSkipped(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return []
  const out: [number, number][] = []
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 2 && isFiniteNum(item[0]) && isFiniteNum(item[1])) {
      out.push([item[0] as number, item[1] as number])
    }
  }
  return out
}

// ── parseState ────────────────────────────────────────────────────────────────

/**
 * Validates raw JSON from state.json.
 * Returns null on anything malformed; never throws.
 */
export function parseState(json: unknown): IndexerState | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const raw = json as Record<string, unknown>

    const network = raw['network']
    if (network !== 'mainnet' && network !== 'testnet') return null

    const next = raw['next']
    const tip = raw['tip']
    const chainId = raw['chainId']
    if (!isFiniteNum(next) || !isFiniteNum(tip) || !isFiniteNum(chainId)) return null

    const updatedAt = raw['updatedAt']
    if (typeof updatedAt !== 'string' || updatedAt.length === 0) return null

    const openHour = raw['openHour']
    const openHourVal = typeof openHour === 'string' ? openHour : null

    const openHourStart = raw['openHourStart']
    const openHourStartVal = isFiniteNum(openHourStart) ? openHourStart : null

    const skipped = parseSkipped(raw['skipped'])

    return {
      next: next as number,
      tip: tip as number,
      network: network as 'mainnet' | 'testnet',
      chainId: chainId as number,
      openHour: openHourVal,
      openHourStart: openHourStartVal,
      skipped,
      updatedAt,
    }
  } catch {
    return null
  }
}

// ── deriveStatus ──────────────────────────────────────────────────────────────

const REQUIRED_HOURS: Record<'1h' | '24h' | '7d', number> = { '1h': 1, '24h': 24, '7d': 168 }
const STALE_MS = 3 * 3_600_000

/**
 * Derives all displayable values from the parsed state and apps-latest meta.
 * `now` defaults to Date.now() and is injectable for testing.
 */
export function deriveStatus(
  state: IndexerState,
  meta: AppsLatestMeta | null | undefined,
  now = Date.now(),
): StatusDerived {
  const lastIndexedBlock = state.next - 1
  const lagBlocks = Math.max(0, state.tip - state.next + 1)

  const updatedAgoMs = now - Date.parse(state.updatedAt)
  const isStale = !isFinite(updatedAgoMs) || updatedAgoMs > STALE_MS

  const coverageHours = meta?.coverageHours ?? 0

  const coverage: WindowCoverage[] = (['1h', '24h', '7d'] as const).map(win => ({
    window: win,
    source: coverageHours >= REQUIRED_HOURS[win] ? 'indexer' : 'arcscan',
    requiredHours: REQUIRED_HOURS[win],
  }))

  const skipped = state.skipped.map(([from, to]) => ({
    from,
    to,
    count: to - from + 1,
  }))

  return {
    lastIndexedBlock,
    tip: state.tip,
    lagBlocks,
    updatedAt: state.updatedAt,
    updatedAgoMs,
    isStale,
    openHour: state.openHour,
    skipped,
    coverage,
  }
}

// ── timeAgo ───────────────────────────────────────────────────────────────────

/**
 * Returns a short human-readable "N minutes ago" / "N hours ago" string.
 */
export function timeAgo(ms: number): string {
  if (!isFinite(ms) || ms < 0) return 'unknown'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs} second${secs !== 1 ? 's' : ''} ago`
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
  const hours = Math.floor(ms / 3_600_000)
  return `${hours} hour${hours !== 1 ? 's' : ''} ago`
}
