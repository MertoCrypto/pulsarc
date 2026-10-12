/**
 * Pure FX-rate helpers for the EURC/USDC rate card.
 * No React, no DOM. Safe to run with:
 *   node --experimental-strip-types src/lib/fx.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FxDoc {
  network: string
  generatedAt: string
  sourceLabel: string
  pool: string
  usdcPerEurc: number
  eurcPerUsdc: number
  change24hPct: number | null
  series: { hour: string; usdcPerEurc: number }[]
}

// ---------------------------------------------------------------------------
// Validation helpers (private)
// ---------------------------------------------------------------------------

const HOUR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}$/
const POOL_RE = /^0x[0-9a-fA-F]{40}$/

function isFinitePositive(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v > 0
}

// ---------------------------------------------------------------------------
// parseFx
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a raw fx.json payload.
 * Returns null when the top-level shape is invalid or when the series
 * contains no valid entries.
 * Malformed series entries are silently dropped; order of valid entries
 * is preserved.
 */
export function parseFx(raw: unknown): FxDoc | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null

  const r = raw as Record<string, unknown>

  // Required top-level scalars
  if (typeof r.network !== 'string') return null
  if (typeof r.generatedAt !== 'string') return null
  if (!isFinitePositive(r.usdcPerEurc)) return null
  if (!isFinitePositive(r.eurcPerUsdc)) return null

  // change24hPct: finite number or null/absent
  const rawChange = r.change24hPct
  let change24hPct: number | null = null
  if (rawChange !== null && rawChange !== undefined) {
    if (typeof rawChange !== 'number' || !isFinite(rawChange)) return null
    change24hPct = rawChange
  }

  // source sub-object
  const src = r.source
  if (src === null || typeof src !== 'object' || Array.isArray(src)) return null
  const srcObj = src as Record<string, unknown>

  const sourceLabel =
    typeof srcObj.label === 'string' && srcObj.label.length > 0
      ? srcObj.label
      : 'Curve pool (marginal price)'

  const pool = srcObj.pool
  if (typeof pool !== 'string' || !POOL_RE.test(pool)) return null

  // series: must be array; drop bad entries
  if (!Array.isArray(r.series)) return null

  const series: { hour: string; usdcPerEurc: number }[] = []
  for (const entry of r.series) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const e = entry as Record<string, unknown>
    if (typeof e.hour !== 'string' || !HOUR_RE.test(e.hour)) continue
    if (!isFinitePositive(e.usdcPerEurc)) continue
    series.push({ hour: e.hour, usdcPerEurc: e.usdcPerEurc })
  }

  if (series.length === 0) return null

  return {
    network: r.network,
    generatedAt: r.generatedAt,
    sourceLabel,
    pool: pool,
    usdcPerEurc: r.usdcPerEurc,
    eurcPerUsdc: r.eurcPerUsdc,
    change24hPct,
    series,
  }
}

// ---------------------------------------------------------------------------
// isFxFresh
// ---------------------------------------------------------------------------

/**
 * Returns true when the document's generatedAt timestamp is within maxAgeMs
 * of `now`. Treats an unparseable generatedAt as stale.
 */
export function isFxFresh(
  doc: FxDoc,
  now = Date.now(),
  maxAgeMs = 3 * 3_600_000,
): boolean {
  const ts = Date.parse(doc.generatedAt)
  if (!isFinite(ts)) return false
  return now - ts <= maxAgeMs
}

// ---------------------------------------------------------------------------
// fxFormat
// ---------------------------------------------------------------------------

/**
 * Format a number to exactly 4 decimal places using en-US locale.
 * e.g. fxFormat(1.138493) === '1.1385'
 */
export function fxFormat(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n)
}

// ---------------------------------------------------------------------------
// changeTone
// ---------------------------------------------------------------------------

/**
 * Classify the magnitude of a 24-hour percentage change.
 * 'none'   — pct is null
 * 'warn'   — |pct| > 1
 * 'normal' — otherwise
 */
export function changeTone(pct: number | null): 'warn' | 'normal' | 'none' {
  if (pct === null) return 'none'
  return Math.abs(pct) > 1 ? 'warn' : 'normal'
}

// ---------------------------------------------------------------------------
// fxCsvRows
// ---------------------------------------------------------------------------

/**
 * Build CSV-ready rows from a document's series.
 * eurc_per_usdc is the reciprocal of usdcPerEurc rounded to 6 decimal places.
 */
export function fxCsvRows(
  doc: FxDoc,
): { hour: string; usdc_per_eurc: number; eurc_per_usdc: number }[] {
  return doc.series.map(s => ({
    hour: s.hour,
    usdc_per_eurc: s.usdcPerEurc,
    eurc_per_usdc: Math.round((1 / s.usdcPerEurc) * 1_000_000) / 1_000_000,
  }))
}
