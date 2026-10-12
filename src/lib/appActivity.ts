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
import type { ActivityEvent, AnchorSample, AppSample, AppLifetime } from './appMetrics.ts'

export * from './appMetrics.ts'

const ZERO = '0x0000000000000000000000000000000000000000'
const DAY = 24 * 3600_000

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

async function readPages<T extends { timestamp: string }>(path: string, pages: number, horizon: number, priority: number): Promise<{ items: T[]; hasMore: boolean }> {
  const out: T[] = []
  let cursor: Record<string, unknown> | null = null
  let hasMore = false
  for (let i = 0; i < pages; i++) {
    let page: Page<T>
    try {
      page = await arcscan<Page<T>>(path, cursor ?? undefined, priority)
    } catch (err) {
      if (i === 0) throw err
      hasMore = true // a deeper page failed: keep what we have and treat the rest as unread
      break
    }
    out.push(...page.items)
    cursor = page.next_page_params
    hasMore = cursor !== null
    const oldest = page.items[page.items.length - 1]
    if (!cursor || !oldest) break
    if (Date.now() - new Date(oldest.timestamp).getTime() > horizon) break // past the widest window, plus one earlier window to compare with
  }
  return { items: out, hasMore }
}

const live = (a: string | undefined) => (a ? a.toLowerCase() : '')

async function sampleAnchor(anchor: Anchor, pages: number, horizon: number, priority: number): Promise<AnchorSample> {
  const balanceReq = arcscan<{ coin_balance: string | null }>(`/addresses/${anchor.address}`, undefined, { priority, timeoutMs: 6000, attempts: 1 })
    .then(a => scaled(a.coin_balance, 18))
    .catch(() => 0)

  let events: ActivityEvent[]
  let hasMore: boolean

  if (anchor.kind === 'token') {
    const { items, hasMore: more } = await readPages<RawTransfer>(`/tokens/${anchor.address}/transfers`, pages, horizon, priority)
    hasMore = more
    events = items.map(t => ({
      ts: new Date(t.timestamp).getTime(),
      wallets: [live(t.from?.hash), live(t.to?.hash)].filter(a => a && a !== ZERO && a !== live(anchor.address)),
      usd: anchor.usd ? scaled(t.total?.value, t.total?.decimals ?? 18) : null,
      fee: 0,
      hash: t.transaction_hash,
    }))
  } else {
    const { items, hasMore: more } = await readPages<RawTx>(`/addresses/${anchor.address}/transactions`, pages, horizon, priority)
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

export async function sampleApp(app: ArcApp, pages: number, horizon = 2 * DAY, priority = 0): Promise<AppSample> {
  const anchors: AnchorSample[] = []
  for (const a of app.anchors) anchors.push(await sampleAnchor(a, pages, horizon, priority))
  return { appId: app.id, anchors, fetchedAt: Date.now() }
}

// ── Lifetime counters ──────────────────────────────────────────────────────

const count = (v: string | undefined) => Number(v ?? 0) || 0

export async function lifetimeOf(app: ArcApp, priority = 0): Promise<AppLifetime> {
  let txCount = 0
  let holders: number | null = null
  let tvl = 0
  for (const a of app.anchors) {
    const bal = arcscan<{ coin_balance: string | null }>(`/addresses/${a.address}`, undefined, { priority, timeoutMs: 6000, attempts: 1 }).then(r => scaled(r.coin_balance, 18)).catch(() => 0)
    if (a.kind === 'token') {
      const c = await arcscan<{ transfers_count?: string; token_holders_count?: string }>(`/tokens/${a.address}/counters`, undefined, priority).catch(() => ({}) as { transfers_count?: string; token_holders_count?: string })
      txCount += count(c.transfers_count)
      holders = Math.max(holders ?? 0, count(c.token_holders_count))
    } else {
      const c = await arcscan<{ transactions_count?: string }>(`/addresses/${a.address}/counters`, undefined, priority).catch(() => ({}) as { transactions_count?: string })
      txCount += count(c.transactions_count)
    }
    tvl += await bal
  }
  return { appId: app.id, txCount, holders, tvl, fetchedAt: Date.now() }
}
