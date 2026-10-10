/**
 * Pure data-layer helpers for the pulsarc-indexer apps-latest.json format.
 * No React, no network calls — import-safe in plain Node (--experimental-strip-types).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppWindowStats {
  txs: number
  walletHours: number
  volume: number
  fees: number
}

export interface AppsLatest {
  network: 'mainnet' | 'testnet'
  generatedAt: string
  /** Hourly buckets the indexer holds (newer files only); a window is real once this reaches its length. */
  coverageHours?: number
  note?: string
  apps: Record<string, Record<'1h' | '24h' | '7d', AppWindowStats>>
}

export interface AppMetricsPatch {
  txCount: number
  activeWallets: number
  volume: number | null
  usdcFees: number | null
  source: 'indexer'
}

// ── Validation helpers ────────────────────────────────────────────────────────

const WINDOWS = ['1h', '24h', '7d'] as const
type Win = typeof WINDOWS[number]

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function parseWindowStats(raw: unknown): AppWindowStats | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const txs = r['txs']
  const walletHours = r['walletHours']
  const volume = r['volume']
  const fees = r['fees']
  if (!isFiniteNum(txs) || !isFiniteNum(walletHours) || !isFiniteNum(volume) || !isFiniteNum(fees)) return null
  return { txs, walletHours, volume, fees }
}

// ── parseAppsLatest ───────────────────────────────────────────────────────────

/**
 * Strict validation of the raw JSON from apps-latest.json.
 * Returns null on anything malformed; drops apps with missing/NaN numbers; never throws.
 */
export function parseAppsLatest(json: unknown): AppsLatest | null {
  try {
    if (!json || typeof json !== 'object') return null
    const raw = json as Record<string, unknown>

    const network = raw['network']
    if (network !== 'mainnet' && network !== 'testnet') return null

    const generatedAt = raw['generatedAt']
    if (typeof generatedAt !== 'string' || generatedAt.length === 0) return null

    // note is optional
    const note = typeof raw['note'] === 'string' ? raw['note'] : undefined

    const rawApps = raw['apps']
    if (!rawApps || typeof rawApps !== 'object' || Array.isArray(rawApps)) return null

    const apps: AppsLatest['apps'] = {}
    for (const [appId, rawApp] of Object.entries(rawApps as Record<string, unknown>)) {
      if (!rawApp || typeof rawApp !== 'object') continue
      const appRaw = rawApp as Record<string, unknown>
      const windowMap: Partial<Record<Win, AppWindowStats>> = {}
      let valid = true
      for (const win of WINDOWS) {
        const w = parseWindowStats(appRaw[win])
        if (!w) { valid = false; break }
        windowMap[win] = w
      }
      if (!valid) continue
      apps[appId] = windowMap as Record<Win, AppWindowStats>
    }

    const cov = raw['coverageHours']
    const coverageHours = isFiniteNum(cov) && cov >= 0 ? cov : undefined

    return { network, generatedAt, coverageHours, note, apps }
  } catch {
    return null
  }
}

// ── getAppWindow ──────────────────────────────────────────────────────────────

/**
 * Returns the stats for a specific app+window, or null if any part is missing.
 * Safe on the empty mainnet `apps: {}` case.
 */
export function getAppWindow(
  snap: AppsLatest | null | undefined,
  appId: string,
  win: Win,
): AppWindowStats | null {
  if (!snap) return null
  const appEntry = snap.apps[appId]
  if (!appEntry) return null
  return appEntry[win] ?? null
}

// ── windowsDiffer ─────────────────────────────────────────────────────────────

/**
 * True only when the indexer has genuinely caught up: at least one app shows
 * 24h.txs > 1h.txs AND 7d.txs > 24h.txs.
 * During catch-up all three windows are identical (same partial hour).
 */
export function windowsDiffer(snap: AppsLatest | null | undefined): boolean {
  if (!snap) return false
  for (const entry of Object.values(snap.apps)) {
    const h1 = entry['1h']
    const h24 = entry['24h']
    const h7d = entry['7d']
    if (h24.txs > h1.txs && h7d.txs > h24.txs) return true
  }
  return false
}

// ── isFresh ───────────────────────────────────────────────────────────────────

/**
 * True when the snapshot's generatedAt is within maxAgeMs of `now`.
 * Default maxAgeMs = 3 hours (3 * 3_600_000 ms).
 */
export function isFresh(
  snap: AppsLatest | null | undefined,
  maxAgeMs = 3 * 3_600_000,
  now = Date.now(),
): boolean {
  if (!snap) return false
  const ts = Date.parse(snap.generatedAt)
  if (!isFinite(ts)) return false
  return now - ts < maxAgeMs
}

// ── toAppMetricsPatch ─────────────────────────────────────────────────────────

/**
 * Maps a window snapshot to the shape the app uses internally for app metrics.
 * volume/usdcFees are null when zero (meaning "no data").
 */
export function toAppMetricsPatch(w: AppWindowStats): AppMetricsPatch {
  return {
    txCount: w.txs,
    activeWallets: w.walletHours,
    volume: w.volume === 0 ? null : w.volume,
    usdcFees: w.fees === 0 ? null : w.fees,
    source: 'indexer',
  }
}
