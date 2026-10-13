/**
 * Pure aggregation helper — no imports from '@/' or any framework.
 *
 * hourlyToDaily: collapse a sequence of hourly rows into daily totals.
 *
 * Partial-day rules
 * ─────────────────
 * • The FIRST day is partial when its first observed hour is not "00".
 * • The LAST day is partial when its last observed hour is not "23".
 * • A day that is both first and last is partial when either condition holds.
 *
 * Robustness
 * ──────────
 * • Rows with a malformed hour string (cannot slice a 10-char date prefix or
 *   cannot parse a 2-char hour suffix as an integer) are skipped silently.
 * • Rows where txs is not a finite, non-negative number (NaN, Infinity, or a
 *   negative value) are counted as 0 for that hour (still recorded).
 * • Duplicate hour strings are summed together (both are counted).
 * • Input may arrive in any order; output is sorted oldest-to-newest.
 */

export interface HourlyRow {
  hour: string   // e.g. "2026-10-07T17"
  txs: number
}

export interface DailyBucket {
  day: string       // "YYYY-MM-DD"
  txs: number
  partial: boolean
}

export function hourlyToDaily(series: HourlyRow[]): DailyBucket[] {
  // day → { total txs, min hour seen (0-23), max hour seen (0-23) }
  const map = new Map<string, { txs: number; minH: number; maxH: number }>()

  for (const row of series) {
    // Validate shape: need at least 13 chars ("YYYY-MM-DDTHH")
    if (typeof row.hour !== 'string' || row.hour.length < 13) continue
    const day = row.hour.slice(0, 10)
    // Validate day looks like YYYY-MM-DD (10 chars, basic sanity)
    if (day.length !== 10) continue

    const hourStr = row.hour.slice(11, 13)
    const h = parseInt(hourStr, 10)
    if (!Number.isInteger(h) || h < 0 || h > 23) continue

    // Normalise txs: treat anything non-finite or negative as 0
    const t = typeof row.txs === 'number' && Number.isFinite(row.txs) && row.txs >= 0
      ? row.txs
      : 0

    const existing = map.get(day)
    if (existing) {
      existing.txs += t
      if (h < existing.minH) existing.minH = h
      if (h > existing.maxH) existing.maxH = h
    } else {
      map.set(day, { txs: t, minH: h, maxH: h })
    }
  }

  if (map.size === 0) return []

  // Sort days chronologically
  const days = [...map.keys()].sort()
  const firstDay = days[0]
  const lastDay  = days[days.length - 1]

  return days.map(day => {
    const { txs, minH, maxH } = map.get(day)!
    let partial = false
    if (day === firstDay && minH !== 0) partial = true
    if (day === lastDay  && maxH !== 23) partial = true
    return { day, txs, partial }
  })
}
