/**
 * Pure helpers for the balances.json document published by the Pulsarc indexer.
 * No React, no DOM. Safe to run with:
 *   node --experimental-strip-types src/lib/balances.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BalancesDoc {
  network: string
  generatedAt: string
  total: number
  /** Apps sorted by usdc descending, as given by the source document. */
  apps: { id: string; usdc: number }[]
  series: { hour: string; total: number }[]
}

// ---------------------------------------------------------------------------
// Validation helpers (private)
// ---------------------------------------------------------------------------

const HOUR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}$/

function isFiniteNonNeg(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 0
}

// ---------------------------------------------------------------------------
// parseBalances
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a raw balances.json payload.
 *
 * - Returns null when the top-level shape is invalid or when no apps remain
 *   after validation.
 * - Malformed apps entries (missing usdc, negative, non-finite) are silently
 *   dropped; valid entries preserve the source-document order.
 * - Malformed series entries are silently dropped; order is preserved.
 */
export function parseBalances(raw: unknown): BalancesDoc | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null

  const r = raw as Record<string, unknown>

  if (typeof r.network !== 'string') return null
  if (typeof r.generatedAt !== 'string') return null
  if (!isFiniteNonNeg(r.total)) return null

  // apps: must be a plain object whose values have finite usdc >= 0
  if (r.apps === null || typeof r.apps !== 'object' || Array.isArray(r.apps)) return null
  const appsObj = r.apps as Record<string, unknown>

  const apps: { id: string; usdc: number }[] = []
  for (const [id, val] of Object.entries(appsObj)) {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) continue
    const entry = val as Record<string, unknown>
    if (!isFiniteNonNeg(entry.usdc)) continue
    apps.push({ id, usdc: entry.usdc as number })
  }

  if (apps.length === 0) return null

  // series: must be array; drop bad entries
  const series: { hour: string; total: number }[] = []
  if (Array.isArray(r.series)) {
    for (const item of r.series) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
      const s = item as Record<string, unknown>
      if (typeof s.hour !== 'string' || !HOUR_RE.test(s.hour)) continue
      if (!isFiniteNonNeg(s.total)) continue
      series.push({ hour: s.hour, total: s.total as number })
    }
  }

  return {
    network: r.network,
    generatedAt: r.generatedAt,
    total: r.total as number,
    apps,
    series,
  }
}

// ---------------------------------------------------------------------------
// isBalancesFresh
// ---------------------------------------------------------------------------

/**
 * Returns true when the document's generatedAt timestamp is within maxAgeMs
 * of `now`. Treats an unparseable generatedAt as stale.
 */
export function isBalancesFresh(
  doc: BalancesDoc,
  now = Date.now(),
  maxAgeMs = 3 * 3_600_000,
): boolean {
  const ts = Date.parse(doc.generatedAt)
  if (!isFinite(ts)) return false
  return now - ts <= maxAgeMs
}

// ---------------------------------------------------------------------------
// topHolders
// ---------------------------------------------------------------------------

/**
 * Return up to `n` apps that hold USDC > 0, in the order the source provides
 * (apps are already sorted by usdc descending in the document).
 * sharePct is each app's share of doc.total rounded to 1 decimal place
 * (0 when doc.total is 0).
 */
export function topHolders(
  doc: BalancesDoc,
  n = 8,
): { id: string; usdc: number; sharePct: number }[] {
  return doc.apps
    .filter(a => a.usdc > 0)
    .slice(0, n)
    .map(a => ({
      id: a.id,
      usdc: a.usdc,
      sharePct:
        doc.total > 0
          ? Math.round((a.usdc / doc.total) * 1000) / 10
          : 0,
    }))
}

// ---------------------------------------------------------------------------
// formatUsdc
// ---------------------------------------------------------------------------

/**
 * Format a USDC amount as a compact dollar string.
 *
 * - >= 1e9  → "$X.XXB"
 * - >= 1e6  → "$X.XXM"
 * - >= 1e3  → "$X.XXK"
 * - else    → "$X.XX"
 *
 * Always uses en-US locale via Intl.NumberFormat.
 */
export function formatUsdc(n: number): string {
  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v)

  // pick the unit from the raw value, then move up one unit when rounding would print 1,000.00
  const r2 = (v: number) => Math.round(v * 100) / 100
  if (n >= 1e9) return `$${fmt(n / 1e9)}B`
  if (n >= 1e6) return r2(n / 1e6) >= 1000 ? `$${fmt(n / 1e9)}B` : `$${fmt(n / 1e6)}M`
  if (n >= 1e3) return r2(n / 1e3) >= 1000 ? `$${fmt(n / 1e6)}M` : `$${fmt(n / 1e3)}K`
  return r2(n) >= 1000 ? `$${fmt(n / 1e3)}K` : `$${fmt(n)}`
}

// ---------------------------------------------------------------------------
// changeSince
// ---------------------------------------------------------------------------

/**
 * Percent change from the point exactly `hoursBack` hours before the last
 * series point, to the last series point.
 *
 * - Returns null when the earlier hour is not present in the series.
 * - Returns null when the earlier point's total is 0 (avoids division by zero).
 * - The earlier hour is computed via UTC date arithmetic on the last point's
 *   hour string ("YYYY-MM-DDTHH").
 * - Result is rounded to 2 decimal places.
 */
export function changeSince(
  series: { hour: string; total: number }[],
  hoursBack = 24,
): number | null {
  if (series.length === 0) return null

  const last = series[series.length - 1]

  // Parse the last hour string as a UTC timestamp
  const lastMs = Date.parse(last.hour + ':00:00Z')
  if (!isFinite(lastMs)) return null

  // Compute the earlier hour string
  const earlierMs = lastMs - hoursBack * 3_600_000
  const earlierDate = new Date(earlierMs)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const earlierHour =
    `${earlierDate.getUTCFullYear()}-` +
    `${pad2(earlierDate.getUTCMonth() + 1)}-` +
    `${pad2(earlierDate.getUTCDate())}T` +
    `${pad2(earlierDate.getUTCHours())}`

  const earlier = series.find(s => s.hour === earlierHour)
  if (earlier === undefined) return null
  if (earlier.total === 0) return null

  const pct = ((last.total - earlier.total) / earlier.total) * 100
  return Math.round(pct * 100) / 100
}
