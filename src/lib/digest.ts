/**
 * Pure data-layer helpers for the pulsarc-indexer digest-latest.json format.
 * No React, no network — importable in plain Node (--experimental-strip-types).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestApp {
  app: string
  label: string
  txs: number
  prevTxs: number
  change: number | null
}

export interface DigestWarmingUp {
  status: 'warming-up'
  network: 'mainnet' | 'testnet'
  generatedAt: string
  readyAt: string | null
  hoursHeld: number
  hoursNeeded: number
}

export interface DigestOk {
  status: 'ok'
  network: 'mainnet' | 'testnet'
  generatedAt: string
  from: string
  to: string
  network_txs: number
  network_prev_txs: number
  network_change: number | null
  growers: DigestApp[]
  fallers: DigestApp[]
  top: DigestApp[]
  shareText: string
}

export type DigestSnap = DigestWarmingUp | DigestOk

// ── helpers ───────────────────────────────────────────────────────────────────

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function isNullableInt(v: unknown): v is number | null {
  if (v === null) return true
  return typeof v === 'number' && isFinite(v)
}

function parseDigestApp(raw: unknown): DigestApp | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const app = r['app']
  const label = r['label']
  const txs = r['txs']
  const prevTxs = r['prevTxs']
  const change = r['change']
  if (typeof app !== 'string') return null
  if (typeof label !== 'string') return null
  if (!isFiniteNum(txs)) return null
  if (!isFiniteNum(prevTxs)) return null
  if (!isNullableInt(change)) return null
  return { app, label, txs, prevTxs, change }
}

function parseDigestApps(raw: unknown): DigestApp[] {
  if (!Array.isArray(raw)) return []
  const out: DigestApp[] = []
  for (const item of raw) {
    const parsed = parseDigestApp(item)
    if (parsed) out.push(parsed)
  }
  return out
}

// ── parseDigest ───────────────────────────────────────────────────────────────

/**
 * Strict validation of raw JSON from digest-latest.json.
 * Returns null on anything malformed; never throws.
 */
export function parseDigest(json: unknown): DigestSnap | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const raw = json as Record<string, unknown>

    const network = raw['network']
    if (network !== 'mainnet' && network !== 'testnet') return null

    const generatedAt = raw['generatedAt']
    if (typeof generatedAt !== 'string' || generatedAt.length === 0) return null

    const status = raw['status']

    if (status === 'warming-up') {
      const readyAt = raw['readyAt']
      if (readyAt !== null && typeof readyAt !== 'string') return null
      const hoursHeld = raw['hoursHeld']
      const hoursNeeded = raw['hoursNeeded']
      if (!isFiniteNum(hoursHeld) || !isFiniteNum(hoursNeeded)) return null
      return {
        status: 'warming-up',
        network: network as 'mainnet' | 'testnet',
        generatedAt,
        readyAt: typeof readyAt === 'string' ? readyAt : null,
        hoursHeld,
        hoursNeeded,
      }
    }

    if (status === 'ok') {
      const from = raw['from']
      const to = raw['to']
      if (typeof from !== 'string' || typeof to !== 'string') return null

      const network_txs = raw['network_txs']
      const network_prev_txs = raw['network_prev_txs']
      const network_change = raw['network_change']
      if (!isFiniteNum(network_txs) || !isFiniteNum(network_prev_txs)) return null
      if (!isNullableInt(network_change)) return null

      const growers = parseDigestApps(raw['growers'])
      const fallers = parseDigestApps(raw['fallers'])
      const top = parseDigestApps(raw['top'])

      const shareText = raw['shareText']
      if (typeof shareText !== 'string') return null

      return {
        status: 'ok',
        network: network as 'mainnet' | 'testnet',
        generatedAt,
        from,
        to,
        network_txs,
        network_prev_txs,
        network_change,
        growers,
        fallers,
        top,
        shareText,
      }
    }

    return null
  } catch {
    return null
  }
}

// ── progress ──────────────────────────────────────────────────────────────────

/**
 * Returns an integer 0–100 representing warming-up progress.
 * Safe to call on any DigestSnap; returns 0 for ok status.
 */
export function progress(d: DigestSnap | null | undefined): number {
  if (!d || d.status !== 'warming-up') return 0
  if (d.hoursNeeded <= 0) return 100
  return Math.min(100, Math.round((d.hoursHeld / d.hoursNeeded) * 100))
}

// ── formatChange ──────────────────────────────────────────────────────────────

/**
 * Formats a whole-number percent change for display.
 * "+17%" / "-8%" / "—" for null.
 */
export function formatChange(n: number | null): string {
  if (n === null) return '—'
  if (n >= 0) return `+${n}%`
  return `${n}%`
}
