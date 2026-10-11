/**
 * Pure helpers for network health cards on the Network page.
 * No React, no network — safe for plain Node (--experimental-strip-types).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeriesPoint {
  hour: string
  txs: number
  failed: number
  fees: number
  wallets: number
  blocks: number
  /** ERC-4337 smart-account count for this hour (optional, new field). */
  aa?: number
  /** ERC-4337 user-op tx count for this hour (optional, new field). */
  aaTx?: number
}

export interface IndexedWindow {
  hours: number
  blocks: number
  txs: number
  failed: number
  fees: number
  walletHours: number
  top: unknown[]
  // Optional new fields from the indexer — passed through as-is; activityMix.ts validates them.
  auto?: unknown
  autoCoverageHours?: unknown
  aa?: unknown
  aaTx?: unknown
  buckets?: unknown
  bucketsCoverageHours?: unknown
  big?: unknown
  mb?: unknown
  mbCoverageHours?: unknown
  blk?: unknown
  blkAddr?: unknown
  bridge?: unknown
  bridgeCoverageHours?: unknown
}

export interface LatestSnapshot {
  network: 'mainnet' | 'testnet'
  generatedAt: string
  windows: Record<'1h' | '24h' | '7d', IndexedWindow>
  series: SeriesPoint[]
}

export interface NetworkHealthCards {
  /** Null when txs === 0. */
  successRate: number | null
  /** Network fees in USDC. */
  fees: number
  /** Average fee per tx in USDC; null when txs === 0. */
  avgFee: number | null
  /** Raw transaction count. */
  txs: number
}

export interface SuccessRatePoint {
  hour: string
  /** 0–100, or null when txs is 0. */
  successRate: number | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

/** Optional new keys the indexer may include in a window object. Passed through as-is. */
const WINDOW_OPTIONAL_KEYS = [
  'auto', 'autoCoverageHours', 'aa', 'aaTx',
  'buckets', 'bucketsCoverageHours',
  'big', 'mb', 'mbCoverageHours',
  'blk', 'blkAddr',
  'bridge', 'bridgeCoverageHours',
] as const

function parseWindow(raw: unknown): IndexedWindow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!isFiniteNum(r['txs']) || !isFiniteNum(r['failed']) || !isFiniteNum(r['fees'])) return null
  if (!isFiniteNum(r['hours']) || !isFiniteNum(r['blocks']) || !isFiniteNum(r['walletHours'])) return null
  const win: IndexedWindow = {
    hours: r['hours'] as number,
    blocks: r['blocks'] as number,
    txs: r['txs'] as number,
    failed: r['failed'] as number,
    fees: r['fees'] as number,
    walletHours: r['walletHours'] as number,
    top: Array.isArray(r['top']) ? r['top'] : [],
  }
  for (const key of WINDOW_OPTIONAL_KEYS) {
    if (key in r) {
      (win as unknown as Record<string, unknown>)[key] = r[key]
    }
  }
  return win
}

function parseSeriesPoint(raw: unknown): SeriesPoint | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r['hour'] !== 'string') return null
  if (!isFiniteNum(r['txs']) || !isFiniteNum(r['failed']) || !isFiniteNum(r['fees'])) return null
  if (!isFiniteNum(r['wallets']) || !isFiniteNum(r['blocks'])) return null
  const pt: SeriesPoint = {
    hour: r['hour'] as string,
    txs: r['txs'] as number,
    failed: r['failed'] as number,
    fees: r['fees'] as number,
    wallets: r['wallets'] as number,
    blocks: r['blocks'] as number,
  }
  if (isFiniteNum(r['aa'])) pt.aa = r['aa'] as number
  if (isFiniteNum(r['aaTx'])) pt.aaTx = r['aaTx'] as number
  return pt
}

// ── parseLatest ───────────────────────────────────────────────────────────────

/**
 * Validates raw JSON from latest.json.
 * Returns null on anything malformed; never throws.
 */
export function parseLatest(json: unknown): LatestSnapshot | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const raw = json as Record<string, unknown>

    const network = raw['network']
    if (network !== 'mainnet' && network !== 'testnet') return null

    const generatedAt = raw['generatedAt']
    if (typeof generatedAt !== 'string' || generatedAt.length === 0) return null

    const rawWindows = raw['windows']
    if (!rawWindows || typeof rawWindows !== 'object' || Array.isArray(rawWindows)) return null
    const wRaw = rawWindows as Record<string, unknown>

    const w1h = parseWindow(wRaw['1h'])
    const w24h = parseWindow(wRaw['24h'])
    const w7d = parseWindow(wRaw['7d'])
    if (!w1h || !w24h || !w7d) return null

    const rawSeries = raw['series']
    const series: SeriesPoint[] = []
    if (Array.isArray(rawSeries)) {
      for (const pt of rawSeries) {
        const p = parseSeriesPoint(pt)
        if (p) series.push(p)
      }
    }

    return {
      network: network as 'mainnet' | 'testnet',
      generatedAt,
      windows: { '1h': w1h, '24h': w24h, '7d': w7d },
      series,
    }
  } catch {
    return null
  }
}

// ── isLatestFresh ─────────────────────────────────────────────────────────────

/**
 * True when the snapshot's generatedAt is within maxAgeMs of `now`.
 * Default maxAgeMs = 3 hours.
 */
export function isLatestFresh(
  snap: LatestSnapshot | null | undefined,
  maxAgeMs = 3 * 3_600_000,
  now = Date.now(),
): boolean {
  if (!snap) return false
  const ts = Date.parse(snap.generatedAt)
  if (!isFinite(ts)) return false
  return now - ts < maxAgeMs
}

// ── networkHealthCards ────────────────────────────────────────────────────────

/**
 * Derives the 4 stat card values from a window.
 * successRate and avgFee are null when txs === 0.
 */
export function networkHealthCards(w: IndexedWindow): NetworkHealthCards {
  const txs = w.txs
  const fees = w.fees
  const failed = w.failed
  if (txs === 0) {
    return { successRate: null, fees, avgFee: null, txs }
  }
  const successRate = parseFloat(((1 - failed / txs) * 100).toFixed(2))
  const avgFee = fees / txs
  return { successRate, fees, avgFee, txs }
}

// ── successRateSeries ─────────────────────────────────────────────────────────

/**
 * Converts the series array to success-rate data for Recharts.
 * Keeps the last `limit` points (default 48 = 48h).
 */
export function successRateSeries(
  series: SeriesPoint[],
  limit = 48,
): SuccessRatePoint[] {
  const slice = series.slice(-limit)
  return slice.map(pt => ({
    hour: pt.hour,
    successRate: pt.txs === 0 ? null : parseFloat(((1 - pt.failed / pt.txs) * 100).toFixed(2)),
  }))
}
