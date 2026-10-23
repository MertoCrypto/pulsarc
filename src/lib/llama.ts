/**
 * Pure parsers/derivations for DefiLlama API responses.
 * No React, no fetch — only data transformations.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  date: number   // unix seconds
  usd: number
}

export interface LatestAndChange {
  latest: number
  prev: number
  change: number | null   // fraction (0.1 = 10%); null if prev missing or <= 0
}

export interface OverviewProtocol {
  name: string
  displayName: string
  category: string
  slug: string
  logo: string | null
  total24h: number
  total7d: number
  total30d: number
  totalAllTime: number | null
  change1d: number | null
}

export interface OverviewResult {
  total24h: number
  total7d: number
  total30d: number
  change1d: number | null
  chart: SeriesPoint[]
  protocols: OverviewProtocol[]
}

export interface VenueShareRow {
  name: string
  total24h: number
  share: number        // fraction of venuesSum (0..1)
}

export interface VenueShareResult {
  rows: VenueShareRow[]
  venuesSum: number
  providerTotal: number
}

// ---------------------------------------------------------------------------
// toLocalLogo
// ---------------------------------------------------------------------------

const LLAMA_ICON_ORIGIN = 'https://icons.llamao.fi'

/**
 * Rewrite a DefiLlama icon URL to a same-origin path via the /llama-icons proxy.
 * Only rewrites URLs whose origin is exactly https://icons.llamao.fi — anything
 * else (different host, http://, null) returns null so we never hotlink a
 * third-party host.
 */
export function toLocalLogo(url: string | null): string | null {
  if (url == null) return null
  if (!url.startsWith(LLAMA_ICON_ORIGIN + '/')) return null
  const rest = url.slice(LLAMA_ICON_ORIGIN.length)  // starts with '/'
  return '/llama-icons' + rest
}

// ---------------------------------------------------------------------------
// parseChainSeries
// ---------------------------------------------------------------------------

/**
 * Parse the chain-TVL response from /v2/historicalChainTvl/<chain>.
 * Input: array of { date: number, tvl: number }
 * Output: sorted asc, non-finite dropped.
 */
export function parseChainSeries(json: unknown): SeriesPoint[] {
  if (!Array.isArray(json)) return []
  const out: SeriesPoint[] = []
  for (const item of json) {
    if (item == null || typeof item !== 'object') continue
    const d = (item as Record<string, unknown>).date
    const v = (item as Record<string, unknown>).tvl
    const date = Number(d)
    const usd = Number(v)
    if (Number.isFinite(date) && Number.isFinite(usd)) {
      out.push({ date, usd })
    }
  }
  out.sort((a, b) => a.date - b.date)
  return out
}

// ---------------------------------------------------------------------------
// latestAndChange
// ---------------------------------------------------------------------------

/**
 * From a sorted series, return the latest value and the value exactly `days`
 * UTC days before the latest point.  `change` is the fractional change from
 * prev to latest; null when prev is missing or <= 0.
 */
export function latestAndChange(series: SeriesPoint[], days: number): LatestAndChange {
  if (series.length === 0) return { latest: 0, prev: 0, change: null }

  const last = series[series.length - 1]
  const latest = last.usd
  const targetDate = last.date - days * 86400

  // Find the point closest to targetDate
  let best: SeriesPoint | undefined
  let bestDiff = Infinity
  for (const p of series) {
    const diff = Math.abs(p.date - targetDate)
    if (diff < bestDiff) { bestDiff = diff; best = p }
  }

  const TOLERANCE = 0.6 * 86400  // within 0.6 days
  if (!best || bestDiff > TOLERANCE) return { latest, prev: 0, change: null }

  const prev = best.usd
  const change = prev > 0 ? (latest - prev) / prev : null
  return { latest, prev, change }
}

// ---------------------------------------------------------------------------
// parseOverview  (fees or dexs)
// ---------------------------------------------------------------------------

/**
 * Parse a DefiLlama "overview" response (fees or dexs endpoint).
 * totalDataChart: [ [unixSeconds, value], ... ]
 */
export function parseOverview(json: unknown): OverviewResult {
  const obj = json as Record<string, unknown>

  const total24h   = toNum(obj.total24h)
  const total7d    = toNum(obj.total7d)
  const total30d   = toNum(obj.total30d)
  // DefiLlama change_1d is already a percent (e.g. 308.5 = +308.5%), convert to fraction.
  const raw1d      = toNullableNum(obj.change_1d)
  const change1d   = raw1d !== null ? raw1d / 100 : null

  // Parse totalDataChart: [[unixSeconds, value], ...]
  const chart: SeriesPoint[] = []
  const rawChart = obj.totalDataChart
  if (Array.isArray(rawChart)) {
    for (const entry of rawChart) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const date = Number(entry[0])
        const usd  = Number(entry[1])
        if (Number.isFinite(date) && Number.isFinite(usd)) {
          chart.push({ date, usd })
        }
      }
    }
  }
  chart.sort((a, b) => a.date - b.date)

  // Parse protocols
  const protocols: OverviewProtocol[] = []
  const rawProtos = obj.protocols
  if (Array.isArray(rawProtos)) {
    for (const p of rawProtos) {
      if (p == null || typeof p !== 'object') continue
      const r = p as Record<string, unknown>
      protocols.push({
        name:         toStr(r.name),
        displayName:  toStr(r.displayName) || toStr(r.name),
        category:     toStr(r.category),
        slug:         toStr(r.slug),
        logo:         toLocalLogo(typeof r.logo === 'string' ? r.logo : null),
        total24h:     toNum(r.total24h),
        total7d:      toNum(r.total7d),
        total30d:     toNum(r.total30d),
        totalAllTime: toNullableNum(r.totalAllTime),
        change1d:     (() => { const v = toNullableNum(r.change_1d); return v !== null ? v / 100 : null })(),
      })
    }
  }

  return { total24h, total7d, total30d, change1d, chart, protocols }
}

// ---------------------------------------------------------------------------
// topProtocols
// ---------------------------------------------------------------------------

/**
 * Return the top `n` protocols sorted descending by `by` field,
 * with ties broken by name ascending.
 */
export function topProtocols(
  protocols: OverviewProtocol[],
  n: number,
  by: 'total24h' | 'total7d' | 'total30d' = 'total24h',
): OverviewProtocol[] {
  return [...protocols]
    .sort((a, b) => {
      const diff = b[by] - a[by]
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name)
    })
    .slice(0, n)
}

// ---------------------------------------------------------------------------
// launchpads
// ---------------------------------------------------------------------------

/**
 * Return protocols in the "Launchpad" category, sorted by total24h desc then
 * total7d desc.  Drops rows where total30d === 0 AND total24h === 0.
 */
export function launchpads(protocols: OverviewProtocol[]): OverviewProtocol[] {
  return protocols
    .filter(p => p.category === 'Launchpad' && !(p.total30d === 0 && p.total24h === 0))
    .sort((a, b) => {
      const d24 = b.total24h - a.total24h
      if (d24 !== 0) return d24
      return b.total7d - a.total7d
    })
}

// ---------------------------------------------------------------------------
// venueShares
// ---------------------------------------------------------------------------

/**
 * Return top `n` venues by total24h with share = total24h / venuesSum, plus
 * an "Other" row for the remainder.  Also returns { venuesSum, providerTotal }.
 *
 * `providerTotal` is the headline total24h from the overview (may differ from
 * the per-protocol sum due to attribution).  `venuesSum` is the actual sum of
 * all per-protocol total24h values.  Share is computed from venuesSum.
 *
 * IMPORTANT: share is computed from venuesSum (sum of all per-protocol rows),
 * NOT from providerTotal (the headline figure), because these frequently differ.
 */
export function venueShares(protocols: OverviewProtocol[], n: number, providerTotal = 0): VenueShareResult {
  const venuesSum = protocols.reduce((s, p) => s + p.total24h, 0)
  // If providerTotal not supplied, default to venuesSum
  const resolvedProviderTotal = providerTotal > 0 ? providerTotal : venuesSum

  const sorted = [...protocols].sort((a, b) => {
    const diff = b.total24h - a.total24h
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })

  const top = sorted.slice(0, n)
  const rest = sorted.slice(n)
  const otherTotal = rest.reduce((s, p) => s + p.total24h, 0)

  const denom = venuesSum > 0 ? venuesSum : 1
  const rows: VenueShareRow[] = top.map(p => ({
    name: p.displayName || p.name,
    total24h: p.total24h,
    share: p.total24h / denom,
  }))

  if (rest.length > 0) {
    rows.push({ name: 'Other', total24h: otherTotal, share: otherTotal / denom })
  }

  return { rows, venuesSum, providerTotal: resolvedProviderTotal }
}

// ---------------------------------------------------------------------------
// headlineMismatch
// ---------------------------------------------------------------------------

/**
 * Returns true when the provider's headline total is more than 1.5× the sum
 * of the listed venues (indicating a significant discrepancy).
 */
export function headlineMismatch(providerTotal: number, venuesSum: number): boolean {
  if (venuesSum <= 0) return false
  return providerTotal > 1.5 * venuesSum
}

// ---------------------------------------------------------------------------
// parseStablecoins
// ---------------------------------------------------------------------------

export interface StablecoinsResult {
  series: SeriesPoint[]
  change7d: LatestAndChange
}

/**
 * Parse the stablecoins chart response.
 * Each element: { date: string, totalCirculatingUSD: { peggedUSD: number, ... } }
 */
export function parseStablecoins(json: unknown): StablecoinsResult {
  const series: SeriesPoint[] = []
  if (Array.isArray(json)) {
    for (const item of json) {
      if (item == null || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      const date = Number(r.date)
      const circ = r.totalCirculatingUSD as Record<string, unknown> | undefined
      if (!circ) continue
      const usd = Number(circ.peggedUSD)
      if (Number.isFinite(date) && Number.isFinite(usd)) {
        series.push({ date, usd })
      }
    }
  }
  series.sort((a, b) => a.date - b.date)
  const change7d = latestAndChange(series, 7)
  return { series, change7d }
}

// ---------------------------------------------------------------------------
// stableChange  (alias, same as latestAndChange with 7 days)
// ---------------------------------------------------------------------------

export function stableChange(series: SeriesPoint[], days: number): LatestAndChange {
  return latestAndChange(series, days)
}

// ---------------------------------------------------------------------------
// lastFullDay
// ---------------------------------------------------------------------------

/**
 * Strip the last point when it corresponds to today's UTC date (partial day).
 * Charts mark the partial day; KPI values come from provider fields.
 * Accepts an optional `nowMs` for testability (defaults to Date.now()).
 */
export function lastFullDay(series: SeriesPoint[], nowMs: number = Date.now()): SeriesPoint[] {
  if (series.length === 0) return series
  const last = series[series.length - 1]
  const todayUtc = utcDateKey(nowMs / 1000)
  const lastUtc  = utcDateKey(last.date)
  if (lastUtc === todayUtc) {
    return series.slice(0, series.length - 1)
  }
  return series
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return ''
}

function toNum(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toNullableNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Returns "YYYY-MM-DD" for a unix-seconds timestamp in UTC. */
function utcDateKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
