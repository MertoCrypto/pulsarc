/**
 * Measures an app from ArcScan.
 *
 * We read the newest page(s) of each anchor's activity (token transfers or contract
 * transactions). If those pages reach back past the requested window the numbers are
 * exact; otherwise the app is busier than our sample and the window is extrapolated from
 * the rate we observed — flagged `estimated`.
 */
import { arcscan, scaled } from '@/lib/arcscan'
import { type Anchor, type ArcApp } from '@/data/apps'

const ZERO = '0x0000000000000000000000000000000000000000'
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

interface Party { hash: string }
interface RawTransfer {
  timestamp: string
  transaction_hash: string
  from: Party
  to: Party
  total?: { value?: string; decimals?: string | null } | null
}
interface RawTx {
  timestamp: string
  hash: string
  from: Party
  value: string
  fee?: { value?: string } | null
}
interface Page<T> { items: T[]; next_page_params: Record<string, unknown> | null }

async function readPages<T extends { timestamp: string }>(path: string, pages: number): Promise<{ items: T[]; hasMore: boolean }> {
  const out: T[] = []
  let cursor: Record<string, unknown> | null = null
  let hasMore = false
  for (let i = 0; i < pages; i++) {
    const page: Page<T> = await arcscan<Page<T>>(path, cursor ?? undefined)
    out.push(...page.items)
    cursor = page.next_page_params
    hasMore = cursor !== null
    const oldest = page.items[page.items.length - 1]
    if (!cursor || !oldest) break
    if (Date.now() - new Date(oldest.timestamp).getTime() > DAY) break // past the widest window
  }
  return { items: out, hasMore }
}

const live = (a: string | undefined) => (a ? a.toLowerCase() : '')

async function sampleAnchor(anchor: Anchor, pages: number): Promise<AnchorSample> {
  const balanceReq = arcscan<{ coin_balance: string | null }>(`/addresses/${anchor.address}`)
    .then(a => scaled(a.coin_balance, 18))
    .catch(() => 0)

  let events: ActivityEvent[]
  let hasMore: boolean

  if (anchor.kind === 'token') {
    const { items, hasMore: more } = await readPages<RawTransfer>(`/tokens/${anchor.address}/transfers`, pages)
    hasMore = more
    events = items.map(t => ({
      ts: new Date(t.timestamp).getTime(),
      wallets: [live(t.from?.hash), live(t.to?.hash)].filter(a => a && a !== ZERO && a !== live(anchor.address)),
      usd: anchor.usd ? scaled(t.total?.value, t.total?.decimals ?? 18) : null,
      fee: 0,
      hash: t.transaction_hash,
    }))
  } else {
    const { items, hasMore: more } = await readPages<RawTx>(`/addresses/${anchor.address}/transactions`, pages)
    hasMore = more
    events = items.map(t => {
      const native = scaled(t.value, 18)
      return {
        ts: new Date(t.timestamp).getTime(),
        wallets: [live(t.from?.hash)].filter(a => a && a !== live(anchor.address)),
        usd: native > 0 ? native : null,
        fee: scaled(t.fee?.value, 18),
        hash: t.hash,
      }
    })
  }

  return { anchor, events, hasMore, balance: await balanceReq }
}

export async function sampleApp(app: ArcApp, pages: number): Promise<AppSample> {
  const anchors: AnchorSample[] = []
  for (const a of app.anchors) anchors.push(await sampleAnchor(a, pages))
  return { appId: app.id, anchors, fetchedAt: Date.now() }
}

// ── Metrics ────────────────────────────────────────────────────────────────

export type TimeRange = '1h' | '24h'
export const RANGE_MS: Record<TimeRange, number> = { '1h': 3600_000, '24h': DAY }

export interface AppMetrics {
  txCount: number
  activeWallets: number
  volume: number | null
  tvl: number | null
  usdcFees: number | null
  rankChange: number
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
    estimated,
  }
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
