/**
 * Pure helpers for the Data Freshness card on the /status page.
 * No React, no network — safe for plain Node (--experimental-strip-types).
 */

// ── Max-age table ─────────────────────────────────────────────────────────────

/**
 * Allowed age in minutes per catalog file name.
 * Files not listed here (labels.json, feed.xml, hourly/<YYYY-MM-DD>.json)
 * are not checked by this module.
 */
export const MAX_AGE_MIN: Record<string, number> = {
  'latest.json': 30,
  'apps-latest.json': 30,
  'anomalies.json': 30,
  'discover.json': 30,
  'bridge.json': 30,
  'supply.json': 30,
  'state.json': 30,
  'balances.json': 30,
  'fx.json': 30,           // testnet only
  'digest-latest.json': 30,
  'agents.json': 180,
  'agents-activity.json': 180,
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type FreshState = 'fresh' | 'stale' | 'missing' | 'unknown'

// ── timestampOf ───────────────────────────────────────────────────────────────

/**
 * The time a published file says it was written: `generatedAt` for most files, `updatedAt` for state.json.
 * Returns undefined when the body is not an object or has neither.
 */
export function timestampOf(json: unknown): unknown {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return undefined
  const o = json as Record<string, unknown>
  return o['generatedAt'] ?? o['updatedAt']
}

// ── ageMinutes ────────────────────────────────────────────────────────────────

/**
 * Converts a generatedAt string to the age of the file in minutes.
 *
 * Returns null when:
 *   - generatedAt is not a string
 *   - the string is not parseable as a date
 *   - the parsed time is more than 5 minutes in the future (clock skew guard)
 *
 * Returns 0 when the parsed time is in the future by up to 5 minutes
 * (small clock skew treated as "just generated").
 */
export function ageMinutes(generatedAt: unknown, now = Date.now()): number | null {
  if (typeof generatedAt !== 'string') return null
  const ts = Date.parse(generatedAt)
  if (!isFinite(ts)) return null
  const diffMs = now - ts
  // More than 5 minutes in the future — treat as unusable
  if (diffMs < -5 * 60_000) return null
  // Up to 5 minutes in the future — treat as 0 (just generated)
  return Math.max(0, diffMs / 60_000)
}

// ── classify ──────────────────────────────────────────────────────────────────

/**
 * Classifies the freshness of a single catalog file fetch result.
 *
 * - 'missing'  — HTTP 404
 * - 'unknown'  — network error, non-OK status other than 404, no usable
 *                generatedAt, or the file has no MAX_AGE_MIN entry
 * - 'stale'    — age > MAX_AGE_MIN[file]
 * - 'fresh'    — age <= MAX_AGE_MIN[file]
 */
export function classify(
  file: string,
  status: number | 'error',
  generatedAt: unknown,
  now = Date.now(),
): { state: FreshState; ageMin: number | null } {
  if (status === 404) {
    return { state: 'missing', ageMin: null }
  }
  if (status === 'error' || (typeof status === 'number' && !isOk(status))) {
    return { state: 'unknown', ageMin: null }
  }
  const limit = MAX_AGE_MIN[file]
  if (limit === undefined) {
    // File is not in the checked set
    return { state: 'unknown', ageMin: null }
  }
  const age = ageMinutes(generatedAt, now)
  if (age === null) {
    return { state: 'unknown', ageMin: null }
  }
  if (age > limit) {
    return { state: 'stale', ageMin: age }
  }
  return { state: 'fresh', ageMin: age }
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300
}

// ── rowsToCheck ───────────────────────────────────────────────────────────────

/**
 * Returns the subset of catalog entries that apply to the given network
 * AND have a MAX_AGE_MIN entry, in catalog order.
 */
export function rowsToCheck(
  catalog: { file: string; title: string; nets: ('mainnet' | 'testnet')[] }[],
  net: 'mainnet' | 'testnet',
): { file: string; title: string }[] {
  return catalog
    .filter(e => e.nets.includes(net) && MAX_AGE_MIN[e.file] !== undefined)
    .map(e => ({ file: e.file, title: e.title }))
}

// ── formatAge ─────────────────────────────────────────────────────────────────

/**
 * Formats an age in minutes as a human-readable string.
 *
 * - null          → 'unknown'
 * - < 1 min       → 'just now'
 * - < 60 min      → '12 min ago'
 * - < 1440 min    → '3 h 05 min ago'
 * - >= 1440 min   → '2 d 4 h ago'
 *
 * Uses fixed arithmetic, never toLocaleString() without explicit locale.
 */
export function formatAge(min: number | null): string {
  if (min === null) return 'unknown'
  if (min < 1) return 'just now'
  const m = Math.floor(min)
  if (m < 60) return `${m} min ago`
  if (m < 1440) {
    const h = Math.floor(m / 60)
    const rem = m % 60
    const remStr = rem.toString().padStart(2, '0')
    return `${h} h ${remStr} min ago`
  }
  const d = Math.floor(m / 1440)
  const remH = Math.floor((m % 1440) / 60)
  return `${d} d ${remH} h ago`
}

// ── summarize ────────────────────────────────────────────────────────────────

/**
 * Produces a one-line summary sentence from a set of classified rows.
 *
 * - All fresh → 'All N files fresh'
 * - Any stale/missing/unknown → 'K of N files need attention'
 */
export function summarize(rows: { state: FreshState }[]): string {
  const n = rows.length
  const attention = rows.filter(r => r.state !== 'fresh').length
  if (attention === 0) return `All ${n} files fresh`
  return `${attention} of ${n} files need attention`
}
