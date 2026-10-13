/**
 * Pure, dependency-free module that turns mainnet hourly indexer files into
 * per-app time-series data.
 *
 * NO '@/' aliases, NO import.meta — safe for Node test runner.
 *
 * Indexer URL pattern:
 *   https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/hourly/YYYY-MM-DD.json
 *
 * Each file is a JSON object whose keys are 'YYYY-MM-DDTHH' (UTC hour) and
 * whose values are HourlyHour objects.
 */

// ── Indexer file types ────────────────────────────────────────────────────────

/** Per-app metrics inside one hourly bucket. */
export interface HourlyAppEntry {
  tx:      number
  wallets: number
  vol:     number
  fee:     number
}

/** One hour bucket from the indexer file. */
export interface HourlyHour {
  txs?:   number
  fees?:  number
  apps?:  Record<string, HourlyAppEntry>
  [k: string]: unknown
}

/** A single hourly data point for one app (oldest → newest order). */
export interface HourlyPoint {
  hour:    string   // 'YYYY-MM-DDTHH'
  tx:      number
  wallets: number
  vol:     number
  fee:     number
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Build a per-app hourly series from one or more day-files.
 *
 * @param files   A single day-file object OR an array of them.
 *                When an array is given, later elements beat earlier ones for
 *                the same hour key (last-writer-wins — no double-counting).
 * @param appIds  App IDs to extract.  Apps absent from a bucket default to 0.
 * @returns       Record<appId, HourlyPoint[]> sorted oldest → newest.
 */
export function appSeriesFromHourly(
  files: Record<string, HourlyHour>[] | Record<string, HourlyHour>,
  appIds: string[],
): Record<string, HourlyPoint[]> {
  // Normalise to an array; later entries win for duplicate hour keys.
  const fileArray = Array.isArray(files) ? files : [files]

  // Merge all hour buckets: last file in the array wins for duplicate keys.
  const merged: Record<string, HourlyHour> = {}
  for (const file of fileArray) {
    if (file == null || typeof file !== 'object') continue
    for (const [hourKey, bucket] of Object.entries(file)) {
      // Basic sanity check: key must look like 'YYYY-MM-DDTHH'
      if (!isValidHourKey(hourKey)) continue
      // Bucket must be a non-null object
      if (bucket == null || typeof bucket !== 'object') continue
      merged[hourKey] = bucket
    }
  }

  // Sort hour keys ascending (lexicographic sort works for ISO format).
  const sortedHours = Object.keys(merged).sort()

  // Build series per app.
  const result: Record<string, HourlyPoint[]> = {}
  for (const appId of appIds) {
    result[appId] = []
  }

  for (const hour of sortedHours) {
    const bucket = merged[hour]
    const apps = (bucket.apps != null && typeof bucket.apps === 'object')
      ? (bucket.apps as Record<string, unknown>)
      : {}

    for (const appId of appIds) {
      const raw = apps[appId]

      // Distinguish three cases:
      //  1. Key absent from apps map → app not tracked this hour → zero-fill
      //  2. Key present with a valid object → use its fields (missing fields → 0)
      //  3. Key present but value is not a plain non-null object → CORRUPT → skip (no point)
      const keyPresent = Object.prototype.hasOwnProperty.call(apps, appId)

      let entry: HourlyPoint

      if (!keyPresent) {
        // Case 1: absent — fill with zeros so the timeline stays aligned.
        entry = { hour, tx: 0, wallets: 0, vol: 0, fee: 0 }
      } else if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        // Case 2: valid object entry.
        const r = raw as Record<string, unknown>
        const tx      = safeNum(r['tx'])
        const wallets = safeNum(r['wallets'])
        const vol     = safeNum(r['vol'])
        const fee     = safeNum(r['fee'])
        // If ALL four fields are unreadable the entry is corrupt → skip.
        if (tx === null && wallets === null && vol === null && fee === null) continue
        entry = {
          hour,
          tx:      tx      ?? 0,
          wallets: wallets ?? 0,
          vol:     vol     ?? 0,
          fee:     fee     ?? 0,
        }
      } else {
        // Case 3: key present but value is null / primitive / array → corrupt → skip.
        continue
      }

      result[appId].push(entry)
    }
  }

  return result
}

// ── Adapter: HourlyPoint[] → HistoryPoint[] ───────────────────────────────────
//
// HistoryPoint is defined in src/lib/appMetrics.ts which is NOT provided in
// this context snapshot.  From DApp.tsx and Compare.tsx usage the fields that
// are consumed are:
//   label:         string   — x-axis tick (we use 'HH:00' from the hour key)
//   txCount:       number
//   activeWallets: number
//   volume:        number
//   usdcFees:      number
//
// These four numeric fields map 1-to-1 from HourlyPoint.  Any additional
// fields defined in appMetrics.ts are KODDAN BELLI DEGIL and are therefore
// NOT set here — the adapter only fills the surface that DApp.tsx / Compare.tsx
// read directly.

export interface HistoryPointLike {
  label:         string
  txCount:       number
  activeWallets: number
  volume:        number
  usdcFees:      number
}

/**
 * Convert a per-app HourlyPoint array to the HistoryPoint shape consumed by
 * MetricChart and the Compare page.
 *
 * `wallets` from the indexer is the count of distinct wallets IN THAT HOUR —
 * it is NOT a running total.  We pass it straight through as `activeWallets`
 * because HistoryPoint.activeWallets represents per-slot active wallets in the
 * DApp chart.
 */
export function hourlyToHistoryPoints(points: HourlyPoint[]): HistoryPointLike[] {
  return points.map(p => ({
    label:         hourLabel(p.hour),
    txCount:       p.tx,
    activeWallets: p.wallets,
    volume:        p.vol,
    usdcFees:      p.fee,
  }))
}

/**
 * Build a History-like object from multiple per-app series.
 *
 * History.complete meaning (from appActivity.ts context): true when we have
 * ALL the data for the requested window; false when the sample is partial.
 * For indexer-backed data the coverage depends on how many day-files we loaded
 * vs. how many the requested TimeRange requires.
 *
 * Fields of History that are KODDAN BELLI DEGIL (not readable from the
 * provided context): none beyond what is listed below.  The ones consumed by
 * DApp.tsx and Compare.tsx:
 *   perApp:     Record<string, HistoryPointLike[]>
 *   total:      HistoryPointLike[]   (aggregate across all apps — we sum txCount/vol/fee; activeWallets is per-app so we take the max to avoid double-counting)
 *   coveredMs:  number               (ms covered by the returned points)
 *   complete:   boolean
 */
export interface HistoryLike {
  perApp:    Record<string, HistoryPointLike[]>
  total:     HistoryPointLike[]
  coveredMs: number
  complete:  boolean
}

export function buildHistoryFromHourly(
  seriesByApp: Record<string, HourlyPoint[]>,
  complete: boolean,
): HistoryLike {
  // Collect all distinct hour keys, sorted.
  const hourSet = new Set<string>()
  for (const pts of Object.values(seriesByApp)) {
    for (const p of pts) hourSet.add(p.hour)
  }
  const sortedHours = [...hourSet].sort()

  // Build index for quick lookup.
  const index: Record<string, Record<string, HourlyPoint>> = {}
  for (const [appId, pts] of Object.entries(seriesByApp)) {
    index[appId] = {}
    for (const p of pts) index[appId][p.hour] = p
  }

  // Build perApp HistoryPoint arrays (aligned to the full hour list).
  const perApp: Record<string, HistoryPointLike[]> = {}
  for (const appId of Object.keys(seriesByApp)) {
    perApp[appId] = sortedHours.map(h => {
      const p = index[appId]?.[h]
      return {
        label:         hourLabel(h),
        txCount:       p?.tx      ?? 0,
        activeWallets: p?.wallets ?? 0,
        volume:        p?.vol     ?? 0,
        usdcFees:      p?.fee     ?? 0,
      }
    })
  }

  // Build total series (sum across apps per hour).
  const total: HistoryPointLike[] = sortedHours.map((h, i) => {
    let txCount = 0, volume = 0, usdcFees = 0, activeWallets = 0
    for (const appId of Object.keys(seriesByApp)) {
      const pt = perApp[appId][i]
      txCount       += pt.txCount
      volume        += pt.volume
      usdcFees      += pt.usdcFees
      // wallets: take max across apps to avoid double-counting the same wallet
      activeWallets  = Math.max(activeWallets, pt.activeWallets)
    }
    return { label: hourLabel(h), txCount, activeWallets, volume, usdcFees }
  })

  // coveredMs: distance from first to last hour + 1 hour.
  const coveredMs = sortedHours.length > 0
    ? (sortedHours.length) * 3_600_000
    : 0

  return { perApp, total, coveredMs, complete }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DDTHH' → 'HH:00' */
function hourLabel(hourKey: string): string {
  const t = hourKey.split('T')[1]
  return t != null ? `${t}:00` : hourKey
}

/** Returns the numeric value or null if non-finite / wrong type. */
function safeNum(v: unknown): number | null {
  if (typeof v !== 'number') return null
  if (!isFinite(v)) return null
  return v
}

/** 'YYYY-MM-DDTHH' validation — quick regex, not a full date parse. */
function isValidHourKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(key)
}
