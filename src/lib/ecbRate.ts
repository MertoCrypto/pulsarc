/**
 * Pure helpers for the Frankfurter (ECB reference rates) API.
 * No React, no DOM, no network calls.
 * Run with: node --experimental-strip-types --no-warnings src/lib/ecbRate.ts
 *
 * API endpoint:
 *   GET https://api.frankfurter.dev/v1/<start>..<end>?base=EUR&symbols=USD
 *   GET https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD
 *
 * Range shape:  { amount, base:'EUR', start_date, end_date, rates: { 'YYYY-MM-DD': { USD: number } } }
 * Latest shape: { amount, base:'EUR', date, rates: { USD: number } }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EcbRate {
  latestDay: string
  usdPerEur: number
  eurPerUsd: number
  change1dPct: number | null
  series: { day: string; usdPerEur: number }[]
}

// ---------------------------------------------------------------------------
// Private validation helpers
// ---------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function isFinitePositiveRate(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v > 0 && v < 100
}

/**
 * Verify that a string matching DAY_RE corresponds to a real calendar date.
 * e.g. "2026-13-40" matches the regex but is not a real date.
 */
function isRealCalendarDate(day: string): boolean {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

function isValidDay(day: unknown): day is string {
  return (
    typeof day === 'string' &&
    DAY_RE.test(day) &&
    isRealCalendarDate(day)
  )
}

// ---------------------------------------------------------------------------
// parseEcbRate
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a raw Frankfurter API response (both range and
 * single-day /latest shapes).
 *
 * Validation rules:
 * - Must be a non-null, non-array object.
 * - base must equal 'EUR'.
 * - rates must be a non-null, non-array object with at least one valid entry.
 * - Day keys must match /^\d{4}-\d{2}-\d{2}$/ AND be real calendar dates.
 * - USD values must be finite numbers > 0 and < 100.
 * - Malformed entries are silently dropped; valid entries are sorted ascending.
 * - Returns null when no valid entry remains.
 */
export function parseEcbRate(raw: unknown): EcbRate | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null

  const r = raw as Record<string, unknown>

  if (r['base'] !== 'EUR') return null

  const rawRates = r['rates']
  if (rawRates === null || typeof rawRates !== 'object' || Array.isArray(rawRates)) return null

  const ratesObj = rawRates as Record<string, unknown>

  // Detect shape: range vs latest.
  // Range shape has day-keyed sub-objects: { 'YYYY-MM-DD': { USD: number } }
  // Latest shape has direct USD key: { USD: number }
  //
  // We normalise both into an array of { day, usdPerEur } entries.
  const entries: { day: string; usdPerEur: number }[] = []

  const keys = Object.keys(ratesObj)

  // Latest shape: rates has a 'USD' key whose value is a number (not an object).
  // In that case we expect a top-level 'date' field.
  const isLatestShape =
    keys.length === 1 &&
    keys[0] === 'USD' &&
    typeof ratesObj['USD'] !== 'object'

  if (isLatestShape) {
    const dayRaw = r['date']
    const usd = ratesObj['USD']
    if (isValidDay(dayRaw) && isFinitePositiveRate(usd)) {
      entries.push({ day: dayRaw, usdPerEur: usd })
    }
  } else {
    // Range shape: each key is a day string, each value is { USD: number }.
    for (const dayKey of keys) {
      if (!isValidDay(dayKey)) continue

      const dayRates = ratesObj[dayKey]
      if (dayRates === null || typeof dayRates !== 'object' || Array.isArray(dayRates)) continue

      const dayRatesObj = dayRates as Record<string, unknown>
      const usd = dayRatesObj['USD']
      if (!isFinitePositiveRate(usd)) continue

      entries.push({ day: dayKey, usdPerEur: usd })
    }
  }

  if (entries.length === 0) return null

  // Sort ascending by day string (ISO dates sort lexicographically).
  entries.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  const latest = entries[entries.length - 1]
  const prev = entries.length >= 2 ? entries[entries.length - 2] : null

  const change1dPct =
    prev !== null
      ? ((latest.usdPerEur - prev.usdPerEur) / prev.usdPerEur) * 100
      : null

  return {
    latestDay: latest.day,
    usdPerEur: latest.usdPerEur,
    eurPerUsd: 1 / latest.usdPerEur,
    change1dPct,
    series: entries.map(e => ({ day: e.day, usdPerEur: e.usdPerEur })),
  }
}

// ---------------------------------------------------------------------------
// ecbRangeUrl
// ---------------------------------------------------------------------------

/**
 * Build a Frankfurter range URL using UTC dates.
 * start = now − days (default 30); end = now.
 *
 * Example: ecbRangeUrl(new Date('2026-10-12'), 30)
 *   → 'https://api.frankfurter.dev/v1/2026-09-12..2026-10-12?base=EUR&symbols=USD'
 */
export function ecbRangeUrl(now: Date, days = 30): string {
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const startMs = endMs - days * 86_400_000

  const pad = (n: number): string => String(n).padStart(2, '0')

  const fmt = (ms: number): string => {
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }

  return `https://api.frankfurter.dev/v1/${fmt(startMs)}..${fmt(endMs)}?base=EUR&symbols=USD`
}

// ---------------------------------------------------------------------------
// isEcbFresh
// ---------------------------------------------------------------------------

/**
 * Returns true when the rate's latestDay is within maxAgeMs of now.
 * ECB publishes on weekdays only, so the default window is 5 days.
 * Returns false when latestDay cannot be parsed as a date.
 */
export function isEcbFresh(
  rate: EcbRate,
  now = Date.now(),
  maxAgeMs = 5 * 86_400_000,
): boolean {
  if (!DAY_RE.test(rate.latestDay)) return false
  const ts = Date.parse(rate.latestDay)
  if (!isFinite(ts)) return false
  return now - ts <= maxAgeMs
}

// ---------------------------------------------------------------------------
// ecbCsvRows
// ---------------------------------------------------------------------------

/**
 * Build CSV-ready rows from the rate's series.
 * Numbers are returned as raw numbers (not formatted strings).
 */
export function ecbCsvRows(
  rate: EcbRate,
): { day: string; usd_per_eur: number; eur_per_usd: number }[] {
  return rate.series.map(s => ({
    day: s.day,
    usd_per_eur: s.usdPerEur,
    eur_per_usd: 1 / s.usdPerEur,
  }))
}
