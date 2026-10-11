/**
 * Pure helpers for Pulsarc's wallet index.
 * No React, no network calls.
 * All dates formatted with fixed locale 'en-US'.
 * Numbers and dates use en-US locale throughout.
 */

// ── Epoch ──────────────────────────────────────────────────────────────────────

/** Day 0 = 2026-01-01 00:00:00 UTC */
export const EPOCH_MS = Date.UTC(2026, 0, 1)

/** Convert a day number (relative to EPOCH_MS) to a UTC Date. */
export function dayToDate(day: number): Date {
  return new Date(EPOCH_MS + day * 86_400_000)
}

// ── Address helpers ────────────────────────────────────────────────────────────

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/**
 * Returns the 3-char hex shard key for the given address.
 * Returns null (rather than throwing) on invalid input.
 */
export function shardOf(address: string): string | null {
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) return null
  return address.slice(2, 5).toLowerCase()
}

// ── Raw JSON types ─────────────────────────────────────────────────────────────

export interface MetaJson {
  since: number
  through: number
  gaps: number[]
  walletCount: number
  lite: boolean
}

export interface AppsConfig {
  apps: Array<{ id: string; anchors: unknown[] }>
}

/**
 * Packed record: [f, l, d, t, x, e, o, i, a, bo, bi]
 * Indices:       [0, 1, 2, 3, 4, 5, 6, 7, 8,  9, 10]
 */
export interface WalletRecord {
  /** First-active day number */
  f: number
  /** Last-active day number */
  l: number
  /** Active-days bitmap as a hex string */
  d: string
  /** Transactions sent */
  t: number
  /** Failed transactions sent */
  x: number
  /** Fees paid (USDC decimal) */
  e: number
  /** USDC sent */
  o: number
  /** USDC received */
  i: number
  /** Apps bitmask hex string */
  a: string
  /** Bridge-out count */
  bo: number
  /** Bridge-in count */
  bi: number
}

export interface WalletSummary {
  /** UTC date of first active day */
  firstSeen: Date
  /** UTC date of last active day */
  lastActive: Date
  /**
   * Days between first-active day and the last closed day (meta.through), inclusive.
   * = meta.through - f + 1
   */
  ageDays: number
  /** Number of days with any activity (popcount of bitmap) */
  activeDays: number
  /** Longest consecutive active-day run */
  longestStreak: number
  /** activeDays / ageDays (0 when ageDays === 0) */
  activeShare: number
  /** Transactions sent */
  tx: number
  /** Failed transactions */
  failed: number
  /** failed / tx, or null when tx === 0 */
  failedShare: number | null
  /** Fees paid in USDC */
  feesUsdc: number
  /** USDC sent */
  usdcSent: number
  /** USDC received */
  usdcReceived: number
  /** App ids for set bits in the bitmask */
  apps: string[]
  /** Bridge-out count */
  bridgeOut: number
  /** Bridge-in count */
  bridgeIn: number
  /**
   * true when meta.lite — means tx/failed/fees only cover the live-indexing period
   * and may be 0 or too low.
   */
  partial: boolean
}

// ── Parsing ────────────────────────────────────────────────────────────────────

const isFiniteNonNeg = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0

const isHexString = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-fA-F]+$/.test(s)

/** Parse meta.json. Returns null on bad input. */
export function parseMeta(raw: unknown): MetaJson | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!isFiniteNonNeg(r['since'])) return null
  if (!isFiniteNonNeg(r['through'])) return null
  if (!Array.isArray(r['gaps'])) return null
  if (!isFiniteNonNeg(r['walletCount'])) return null
  if (typeof r['lite'] !== 'boolean') return null
  const gaps: number[] = []
  for (const g of r['gaps'] as unknown[]) {
    if (!isFiniteNonNeg(g)) return null
    gaps.push(g as number)
  }
  return {
    since: r['since'] as number,
    through: r['through'] as number,
    gaps,
    walletCount: r['walletCount'] as number,
    lite: r['lite'] as boolean,
  }
}

/** Parse a shard JSON object. Drops malformed entries; returns empty object on total failure. */
export function parseShard(raw: unknown): Record<string, WalletRecord> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, WalletRecord> = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const rec = decodeRecord(val)
    if (rec !== null) result[key.toLowerCase()] = rec
  }
  return result
}

/** Decode an 11-element array into a WalletRecord. Returns null on any validation failure. */
export function decodeRecord(arr: unknown): WalletRecord | null {
  if (!Array.isArray(arr) || arr.length !== 11) return null
  const [f, l, d, t, x, e, o, i, a, bo, bi] = arr as unknown[]
  if (!isFiniteNonNeg(f)) return null
  if (!isFiniteNonNeg(l)) return null
  if (!isHexString(d)) return null
  if (!isFiniteNonNeg(t)) return null
  if (!isFiniteNonNeg(x)) return null
  if (!isFiniteNonNeg(e)) return null
  if (!isFiniteNonNeg(o)) return null
  if (!isFiniteNonNeg(i)) return null
  if (!isHexString(a)) return null
  if (!isFiniteNonNeg(bo)) return null
  if (!isFiniteNonNeg(bi)) return null
  return {
    f: f as number,
    l: l as number,
    d: d as string,
    t: t as number,
    x: x as number,
    e: e as number,
    o: o as number,
    i: i as number,
    a: a as string,
    bo: bo as number,
    bi: bi as number,
  }
}

// ── Bitmap analysis ────────────────────────────────────────────────────────────

/** Count the number of set bits in the active-days bitmap (popcount). Uses BigInt for safety with large bitmaps. */
export function activeDays(rec: WalletRecord): number {
  let n = BigInt('0x' + rec.d)
  let count = 0
  while (n > 0n) {
    count += Number(n & 1n)
    n >>= 1n
  }
  return count
}

/** Longest run of consecutive set bits in the active-days bitmap. */
export function longestStreak(rec: WalletRecord): number {
  let n = BigInt('0x' + rec.d)
  let best = 0
  let current = 0
  while (n > 0n) {
    if (n & 1n) {
      current++
      if (current > best) best = current
    } else {
      current = 0
    }
    n >>= 1n
  }
  return best
}

/**
 * Number of days spanned by the bitmap: last-active day - first-active day + 1.
 * This is the number of days from the first day to the last day, inclusive.
 */
export function activeDaySpan(rec: WalletRecord): number {
  return rec.l - rec.f + 1
}

/** Return the app ids for set bits in rec.a, ignoring bits beyond the apps list length. */
export function appIds(rec: WalletRecord, appsConfig: AppsConfig): string[] {
  const ids: string[] = []
  let mask = BigInt('0x' + rec.a)
  let bit = 0
  while (mask > 0n) {
    if (mask & 1n) {
      if (bit < appsConfig.apps.length) {
        ids.push(appsConfig.apps[bit].id)
      }
      // bits beyond the list are silently ignored
    }
    mask >>= 1n
    bit++
  }
  return ids
}

// ── Summary ────────────────────────────────────────────────────────────────────

/**
 * Derive a plain-facts summary from a record + meta.
 * nowMs is accepted but unused in calculation (reserved for callers); ageDays is
 * defined as (meta.through - rec.f + 1): the number of days from the wallet's
 * first-active day to the last closed day (inclusive).
 */
export function summarize(
  rec: WalletRecord,
  meta: MetaJson,
  appsConfig: AppsConfig,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _nowMs?: number,
): WalletSummary {
  const days = activeDays(rec)
  const streak = longestStreak(rec)
  // ageDays: days between first-active day and last closed day (inclusive)
  const age = meta.through - rec.f + 1
  const share = age > 0 ? days / age : 0
  const failedShare = rec.t > 0 ? rec.x / rec.t : null
  return {
    firstSeen: dayToDate(rec.f),
    lastActive: dayToDate(rec.l),
    ageDays: age,
    activeDays: days,
    longestStreak: streak,
    activeShare: share,
    tx: rec.t,
    failed: rec.x,
    failedShare,
    feesUsdc: rec.e,
    usdcSent: rec.o,
    usdcReceived: rec.i,
    apps: appIds(rec, appsConfig),
    bridgeOut: rec.bo,
    bridgeIn: rec.bi,
    partial: meta.lite,
  }
}

// ── Coverage note ──────────────────────────────────────────────────────────────

/** Format a UTC date as YYYY-MM-DD in en-US locale. */
function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2')
}

/**
 * Returns a human-readable note about the coverage period of the index.
 * Example: "Covers 2026-01-06 to 2026-10-11 (UTC), closed days only."
 * Adds a gaps line if meta.gaps is non-empty.
 */
export function coverageNote(meta: MetaJson): string {
  const from = fmtDay(dayToDate(meta.since))
  const to = fmtDay(dayToDate(meta.through))
  let note = `Covers ${from} to ${to} (UTC), closed days only.`
  if (meta.gaps.length > 0) {
    const gapDates = meta.gaps.map(g => fmtDay(dayToDate(g))).join(', ')
    note += ` Gap${meta.gaps.length > 1 ? 's' : ''}: ${gapDates}.`
  }
  return note
}
