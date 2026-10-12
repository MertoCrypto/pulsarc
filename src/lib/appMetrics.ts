/**
 * Pure metric math for app activity: no network, no browser APIs.
 * Kept apart from appActivity.ts (which talks to ArcScan) so it can be unit tested.
 */
import type { Anchor } from '@/data/apps'

const DAY = 24 * 3600_000

export interface ActivityEvent {
  ts: number
  wallets: string[]
  usd: number | null // dollar amount moved, when known
  fee: number        // USDC paid in gas (contract anchors only)
  hash: string
}

export interface AnchorSample {
  anchor: Anchor
  events: ActivityEvent[] // newest first
  hasMore: boolean        // ArcScan has older pages we did not read
  balance: number         // native USDC held by the anchor
}

export interface AppSample {
  appId: string
  anchors: AnchorSample[]
  fetchedAt: number
}

export interface AppLifetime {
  appId: string
  txCount: number          // lifetime transfers (token anchors) or transactions (contract anchors)
  holders: number | null   // distinct token holders; null when the app has no token anchor
  tvl: number
  fetchedAt: number
}

export function lifetimeMetrics(l: AppLifetime): AppMetrics {
  return {
    txCount: l.txCount,
    activeWallets: l.holders ?? 0,
    usersKnown: l.holders !== null,
    volume: null,
    tvl: l.tvl > 0 ? l.tvl : null,
    usdcFees: null,
    rankChange: 0,
    trend: null,
    estimated: false,
    lifetime: true,
  }
}

// ── Metrics ────────────────────────────────────────────────────────────────

export type TimeRange = '1h' | '24h'
export const RANGE_MS: Record<TimeRange, number> = { '1h': 3600_000, '24h': DAY }

/** Ranges offered on the rankings page; 'all' is read from ArcScan's lifetime counters. */
export type RankRange = TimeRange | '7d' | '30d' | 'all'
export const RANK_RANGE_MS: Record<Exclude<RankRange, 'all'>, number> = { ...RANGE_MS, '7d': 7 * DAY, '30d': 30 * DAY }

export interface Trend {
  txNow: number
  txPrev: number
  walletsNow: number
  walletsPrev: number
  approx: boolean // newer half vs older half of the sample, not two full windows
}

export interface AppMetrics {
  txCount: number
  activeWallets: number
  volume: number | null
  tvl: number | null
  usdcFees: number | null
  rankChange: number
  trend: Trend | null
  /** Lifetime view: users are token holders, and are unknown for apps without a token. */
  lifetime?: boolean
  usersKnown?: boolean
  estimated: boolean // the sample did not reach back to the window start; counts are extrapolated
}

/** Seconds of history the sample actually covers for a busy anchor. */
const oldestOf = (s: AnchorSample) => s.events[s.events.length - 1]?.ts ?? Date.now()
const isComplete = (s: AnchorSample, start: number) => !s.hasMore || oldestOf(s) <= start

export function computeMetrics(sample: AppSample, windowMs: number, now = Date.now(), exclude?: ReadonlySet<string>): AppMetrics {
  const start = now - windowMs
  let tx = 0
  let usd = 0
  let fees = 0
  let tvl = 0
  let hasUsd = false
  let hasFees = false
  let estimated = false
  const wallets = new Set<string>()

  for (const s of sample.anchors) {
    const complete = isComplete(s, start)
    const span = Math.max(now - oldestOf(s), 5000)
    const scale = complete ? 1 : windowMs / span
    if (!complete) estimated = true

    if (s.anchor.usd) hasUsd = true
    if (s.anchor.kind === 'contract') hasFees = true
    tvl += s.balance

    for (const e of s.events) {
      if (e.ts < start) continue
      if (exclude && e.wallets.some(w => exclude.has(w))) continue
      tx += scale
      fees += e.fee * scale
      if (e.usd !== null) { usd += e.usd * scale; hasUsd = true }
      for (const w of e.wallets) wallets.add(w)
    }
  }

  return {
    txCount: Math.round(tx),
    activeWallets: wallets.size,
    volume: hasUsd ? usd : null,
    tvl: tvl > 0 ? tvl : null,
    usdcFees: hasFees ? fees : null,
    rankChange: 0,
    trend: computeTrend(sample, windowMs, now, exclude),
    estimated,
  }
}

/**
 * How activity moved. When the sample reaches back two windows the comparison is exact
 * (this window vs the one before). Otherwise the sample's newer half is compared with its older
 * half — a rate trend, flagged `approx`. Null when there is too little history to say anything.
 */
function computeTrend(sample: AppSample, windowMs: number, now: number, exclude?: ReadonlySet<string>): Trend | null {
  const exact = sample.anchors.every(s => isComplete(s, now - 2 * windowMs))
  const cutAll = now - windowMs
  const wNow = new Set<string>()
  const wPrev = new Set<string>()
  let txNow = 0
  let txPrev = 0

  for (const s of sample.anchors) {
    const skip = (e: ActivityEvent) => !!exclude && e.wallets.some(w => exclude.has(w))
    if (exact || isComplete(s, now - 2 * windowMs)) {
      for (const e of s.events) {
        if (skip(e)) continue
        if (e.ts >= cutAll) { txNow++; e.wallets.forEach(w => wNow.add(w)) }
        else if (e.ts >= cutAll - windowMs) { txPrev++; e.wallets.forEach(w => wPrev.add(w)) }
      }
    } else {
      // busy anchor: newer half of what we read vs older half
      const span = now - oldestOf(s)
      if (span < 60_000) continue
      const mid = now - span / 2
      for (const e of s.events) {
        if (skip(e)) continue
        if (e.ts >= mid) { txNow++; e.wallets.forEach(w => wNow.add(w)) }
        else { txPrev++; e.wallets.forEach(w => wPrev.add(w)) }
      }
    }
  }
  if (txNow + txPrev < 6) return null
  return { txNow, txPrev, walletsNow: wNow.size, walletsPrev: wPrev.size, approx: !exact }
}

// ── History ────────────────────────────────────────────────────────────────

export interface HistoryPoint {
  label: string
  activeWallets: number
  txCount: number
  volume: number
  usdcFees: number
}

export interface History {
  perApp: Record<string, HistoryPoint[]> // same buckets for every app, so charts line up
  total: HistoryPoint[]                  // all given apps summed
  coveredMs: number                      // how far back the points reach
  complete: boolean                      // true when the whole requested window is covered
}

function labelFor(ts: number, bucketMs: number, coveredMs: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (bucketMs < 60_000) return `${hh}:${mm}:${String(d.getSeconds()).padStart(2, '0')}`
  if (coveredMs > 36 * 3600_000) return `${d.getMonth() + 1}/${d.getDate()}`
  return `${hh}:${mm}`
}

interface Bucket { wallets: Set<string>; tx: number; usd: number; fee: number }
const emptyBuckets = (n: number): Bucket[] =>
  Array.from({ length: n }, () => ({ wallets: new Set<string>(), tx: 0, usd: 0, fee: 0 }))

/** Buckets events over one shared timeline. Reaches back only as far as the busiest app's sample allows. */
export function buildHistory(samples: AppSample[], windowMs: number, now = Date.now()): History {
  const windowStart = now - windowMs
  let from = windowStart
  let complete = true
  for (const sample of samples) {
    for (const s of sample.anchors) {
      if (!isComplete(s, windowStart)) {
        complete = false
        from = Math.max(from, oldestOf(s))
      }
    }
  }
  const coveredMs = Math.max(now - from, 1000)
  const n = coveredMs <= 2 * 3600_000 ? 12 : 24
  const bucketMs = coveredMs / n

  const perApp: Record<string, Bucket[]> = {}
  const total = emptyBuckets(n)
  for (const sample of samples) {
    const mine = (perApp[sample.appId] ??= emptyBuckets(n))
    for (const s of sample.anchors) {
      for (const e of s.events) {
        if (e.ts < from || e.ts > now) continue
        const idx = Math.min(n - 1, Math.floor((e.ts - from) / bucketMs))
        for (const b of [mine[idx], total[idx]]) {
          b.tx++
          b.usd += e.usd ?? 0
          b.fee += e.fee
          for (const w of e.wallets) b.wallets.add(w)
        }
      }
    }
  }

  const toPoints = (bs: Bucket[]): HistoryPoint[] =>
    bs.map((b, i) => ({
      label: labelFor(from + i * bucketMs, bucketMs, coveredMs),
      activeWallets: b.wallets.size,
      txCount: b.tx,
      volume: b.usd,
      usdcFees: b.fee,
    }))

  return {
    perApp: Object.fromEntries(Object.entries(perApp).map(([id, bs]) => [id, toPoints(bs)])),
    total: toPoints(total),
    coveredMs,
    complete,
  }
}

export function describeSpan(ms: number): string {
  if (ms < 90_000) return `${Math.round(ms / 1000)} seconds`
  if (ms < 90 * 60_000) return `${Math.round(ms / 60_000)} minutes`
  if (ms < 36 * 3600_000) return `${(ms / 3600_000).toFixed(1)} hours`
  return `${Math.round(ms / DAY)} days`
}
