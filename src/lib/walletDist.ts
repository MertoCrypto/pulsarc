/**
 * Pure helpers for the Pulsarc wallet distribution (dist.json).
 * No React, no network calls.
 * Safe to run under `node --experimental-strip-types`.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WalletDist {
  net: string
  through: number
  walletCount: number
  /** Each present key maps to an array of exactly 101 quantile boundaries q[0..100]. */
  metrics: Partial<Record<'activeDays' | 'tx' | 'usdcSent' | 'usdcReceived', number[]>>
}

// ── Validation helpers ─────────────────────────────────────────────────────────

const METRIC_KEYS = ['activeDays', 'tx', 'usdcSent', 'usdcReceived'] as const
type MetricKey = typeof METRIC_KEYS[number]

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Validate a single metric array: exactly 101 finite numbers, non-decreasing. */
function isValidMetric(arr: unknown): arr is number[] {
  if (!Array.isArray(arr)) return false
  if (arr.length !== 101) return false
  for (let i = 0; i < arr.length; i++) {
    if (!isFiniteNumber(arr[i])) return false
    if (i > 0 && (arr[i] as number) < (arr[i - 1] as number)) return false
  }
  return true
}

// ── parseDist ─────────────────────────────────────────────────────────────────

/**
 * Parse and validate a raw dist.json payload.
 * - Drops any individual metric that fails validation (wrong length, unsorted, NaN, etc.).
 * - Returns null if the top-level shape is invalid OR if no valid metrics remain.
 */
export function parseDist(raw: unknown): WalletDist | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const r = raw as Record<string, unknown>

  const net = r['net']
  if (typeof net !== 'string') return null

  const through = r['through']
  if (!isFiniteNumber(through)) return null

  const walletCount = r['walletCount']
  if (!isFiniteNumber(walletCount) || walletCount < 1) return null

  const rawMetrics = r['metrics']
  if (!rawMetrics || typeof rawMetrics !== 'object' || Array.isArray(rawMetrics)) return null

  const m = rawMetrics as Record<string, unknown>
  const metrics: Partial<Record<MetricKey, number[]>> = {}

  for (const key of METRIC_KEYS) {
    if (key in m) {
      const arr = m[key]
      if (isValidMetric(arr)) {
        metrics[key] = arr
      }
      // silently drop the key when the array is invalid
    }
  }

  if (Object.keys(metrics).length === 0) return null

  return { net, through, walletCount, metrics }
}

// ── percentileOf ──────────────────────────────────────────────────────────────

/**
 * Estimate the share of indexed wallets strictly below `value`, as an integer 0-100.
 *
 * Definition (exact match with the indexer):
 *   below = number of the 101 boundaries q[0..100] that are strictly less than value
 *   return Math.min(100, Math.max(0, below - 1))
 *
 * Interpretation: the result is the percentage of the sample that is estimated to be
 * strictly below `value` (i.e. value at the (below-1)th percentile among 0-100).
 */
export function percentileOf(q: number[], value: number): number {
  let below = 0
  for (let i = 0; i < q.length; i++) {
    if (q[i] < value) below++
  }
  return Math.min(100, Math.max(0, below - 1))
}

// ── describe ──────────────────────────────────────────────────────────────────

interface WalletSummaryInput {
  activeDays: number
  tx: number
  usdcSent: number
  usdcReceived: number
  partial: boolean
}

export interface DescribeLine {
  label: string
  text: string
}

const FMT = new Intl.NumberFormat('en-US')

function fmtN(n: number): string {
  return FMT.format(n)
}

/**
 * Produce one description line per available metric.
 * Order: tx, activeDays, usdcSent, usdcReceived.
 * Skips `tx` when summary.partial is true (mainnet history is rebuilt from
 * USDC transfers, tx count is incomplete).
 */
export function describe(
  dist: WalletDist,
  summary: WalletSummaryInput,
): DescribeLine[] {
  const lines: DescribeLine[] = []
  const n = fmtN(dist.walletCount)

  const emit = (key: MetricKey, label: string, value: number) => {
    const q = dist.metrics[key]
    if (!q) return
    // no spread (everyone has the same value, e.g. one indexed day so far): a percentile says nothing
    if (q[0] === q[100]) return
    const p = percentileOf(q, value)
    let text: string
    if (p >= 1) {
      text = `More than ${p}% of ${n} indexed wallets are estimated to be below this value`
    } else {
      text = `Fewer than 1% of ${n} indexed wallets are below this value`
    }
    lines.push({ label, text })
  }

  if (!summary.partial) {
    emit('tx', 'Transactions sent', summary.tx)
  }
  emit('activeDays', 'Active days', summary.activeDays)
  emit('usdcSent', 'USDC sent', summary.usdcSent)
  emit('usdcReceived', 'USDC received', summary.usdcReceived)

  return lines
}
