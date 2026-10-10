/**
 * Pure data-layer helpers for the pulsarc-indexer anomalies.json format.
 * No React, no network — importable in plain Node (--experimental-strip-types).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnomalyKind = 'spike' | 'drop'

export interface AnomalyItem {
  app: string
  kind: AnomalyKind
  /** spike: ratio = this-hour / median(prev 24h). drop: fraction of median (0.1 = 90% drop). */
  ratio: number
  txs: number
  baseline: number
}

export interface AnomaliesSnap {
  network: 'mainnet' | 'testnet'
  generatedAt: string
  status: 'ok' | 'warming-up' | 'stale'
  hour: string | null
  items: AnomalyItem[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isFinitePos(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 0
}

// ── parseAnomalies ────────────────────────────────────────────────────────────

/**
 * Strict validation of raw JSON from anomalies.json.
 * Returns null on anything malformed; ignores items with unknown kind;
 * clamps absurd ratio values; caps at 5 items; never throws.
 */
export function parseAnomalies(json: unknown): AnomaliesSnap | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const raw = json as Record<string, unknown>

    const network = raw['network']
    if (network !== 'mainnet' && network !== 'testnet') return null

    const generatedAt = raw['generatedAt']
    if (typeof generatedAt !== 'string' || generatedAt.length === 0) return null

    const status = raw['status']
    if (status !== 'ok' && status !== 'warming-up' && status !== 'stale') return null

    const hour = raw['hour']
    if (hour !== null && typeof hour !== 'string') return null

    const rawItems = raw['items']
    if (!Array.isArray(rawItems)) return null

    const items: AnomalyItem[] = []
    for (const ri of rawItems) {
      if (items.length >= 5) break
      if (!ri || typeof ri !== 'object' || Array.isArray(ri)) continue
      const r = ri as Record<string, unknown>

      const app = r['app']
      if (typeof app !== 'string' || app.length === 0) continue

      const kind = r['kind']
      if (kind !== 'spike' && kind !== 'drop') continue // unknown kind: skip

      const ratio = r['ratio']
      const txs = r['txs']
      const baseline = r['baseline']
      if (!isFinitePos(ratio) || !isFinitePos(txs) || !isFinitePos(baseline)) continue

      // Clamp absurd values: ratio max 1000, txs max 10^9
      const clampedRatio = Math.min(ratio, 1000)
      const clampedTxs = Math.min(txs, 1_000_000_000)
      const clampedBaseline = Math.min(baseline, 1_000_000_000)

      items.push({ app, kind, ratio: clampedRatio, txs: clampedTxs, baseline: clampedBaseline })
    }

    return { network, generatedAt, status, hour, items }
  } catch {
    return null
  }
}

// ── isAnomaliesFresh ──────────────────────────────────────────────────────────

/**
 * True when status is 'ok' AND generatedAt is within maxAgeMs of now (default 3h).
 */
export function isAnomaliesFresh(
  snap: AnomaliesSnap | null | undefined,
  now = Date.now(),
  maxAgeMs = 3 * 3_600_000,
): boolean {
  if (!snap) return false
  if (snap.status !== 'ok') return false
  const ts = Date.parse(snap.generatedAt)
  if (!isFinite(ts)) return false
  return now - ts < maxAgeMs
}

// ── describeAnomaly ───────────────────────────────────────────────────────────

/**
 * Returns a short English description of an anomaly item.
 * appName should already be resolved to the display name by the caller.
 *
 * spike: "USDC: 2.5x its usual activity"
 * drop:  "USDC: down 90% vs usual"
 */
export function describeAnomaly(item: AnomalyItem, appName: string): string {
  if (item.kind === 'spike') {
    const mult = Math.round(item.ratio * 10) / 10
    return `${appName}: ${mult}x its usual activity`
  } else {
    // drop: ratio is the fraction remaining (0.1 = 10% left = 90% drop)
    const dropPct = Math.round((1 - item.ratio) * 100)
    return `${appName}: down ${dropPct}% vs usual`
  }
}
