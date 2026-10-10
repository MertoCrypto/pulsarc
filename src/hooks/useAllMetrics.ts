import { useEffect, useMemo, useState } from 'react'
import { ARC_APPS, type AppKind, type ArcApp } from '@/data/apps'
import { READ_PLAN, useAppLifetimes, useAppSamples, useRefreshSamples } from '@/hooks/useAppSamples'
import { computeMetrics, lifetimeMetrics, RANK_RANGE_MS, type AppMetrics, type RankRange } from '@/lib/appActivity'
import { useAppsLatest, getAppWindow } from '@/hooks/useAppsLatest'
import { isIndexerUsable, buildIndexerMetrics } from '@/lib/indexerMetrics'
import { NETWORK } from '@/lib/chain'

export type SortKey = 'txCount' | 'activeWallets' | 'volume' | 'tvl' | 'usdcFees'

export interface RankedApp {
  app: ArcApp
  metrics: AppMetrics
  rank: number
}

export interface AllMetricsState {
  items: RankedApp[]
  isLoading: boolean
  loaded: number
  total: number
  lastUpdated: Date | null
  totals: { volume: number; activeWallets: number; txCount: number; tvl: number }
  /** Where metrics came from this render. */
  source: 'indexer' | 'arcscan'
  /**
   * True when source is 'indexer': activeWallets is the sum of per-hour distinct
   * wallet counts — an upper bound on unique wallets over the window, not an exact
   * deduplicated count.
   */
  walletsAreUpperBound: boolean
}

const SNAP_KEY = (range: string, sort: string) => `pulsarc.rankSnap.v1:${range}:${sort}`
const MIN_AGE = 5 * 60_000   // compare against a snapshot at least this old
const KEEP_AGE = 30 * 60_000 // replace the snapshot once it is this old

interface Snapshot { ts: number; ranks: Record<string, number> }

function readSnapshot(range: string, sort: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY(range, sort))
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch { return null }
}

const sortValue = (m: AppMetrics, key: SortKey) => m[key] ?? -1

/**
 * Real activity for every tracked app. When the indexer snapshot is usable
 * (fresh, caught-up, and covers the requested range) metrics come from it
 * and ArcScan queries are disabled. Otherwise falls back to the ArcScan path
 * with identical behaviour to before.
 *
 * `rankChange` compares with the ranking this browser saw at least 5 minutes ago.
 *
 * Extra returned fields:
 *   source              — 'indexer' | 'arcscan'
 *   walletsAreUpperBound — true when source is 'indexer'
 */
export function useAllMetrics(
  timeRange: RankRange,
  sortKey: SortKey,
  categoryFilter: string,
  opts: { defer?: boolean; kind?: AppKind | 'all' } = {},
): AllMetricsState & { refresh: () => void } {
  // Side widgets wait a moment so the page's own requests get ArcScan's limited capacity first.
  const [ready, setReady] = useState(!opts.defer)
  useEffect(() => {
    if (!opts.defer) return
    const t = window.setTimeout(() => setReady(true), 4000)
    return () => window.clearTimeout(t)
  }, [opts.defer])

  // ── Indexer path (always called — hooks must be unconditional) ──────────────
  const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'
  const { data: snap, isLoading: snapLoading } = useAppsLatest(net)
  const usable = isIndexerUsable(snap, timeRange)

  // ── ArcScan path (disabled when indexer is usable) ──────────────────────────
  const lifetime = timeRange === 'all'
  const plan = READ_PLAN[lifetime ? '24h' : timeRange]
  // Pass `enabled: false` to both ArcScan hooks when the indexer is usable,
  // preserving hook call order as required by React's rules of hooks.
  // Also wait for the indexer query's first answer so ArcScan is not hit needlessly on page load.
  const indexerRange = timeRange === '1h' || timeRange === '24h' || timeRange === '7d'
  const arcScanEnabled = ready && !usable && !(indexerRange && snapLoading)
  const queries   = useAppSamples(ARC_APPS, plan.pages, arcScanEnabled && !lifetime, plan.horizon, plan.every)
  const lifetimes = useAppLifetimes(ARC_APPS, arcScanEnabled && lifetime)
  const refresh   = useRefreshSamples()

  // ── Derived loading / stamp signals ────────────────────────────────────────
  const loadedSamples = queries.map(q => q.data)
  const loadedLife    = lifetimes.map(q => q.data)

  // When using the indexer: count apps that have a window entry.
  // When using ArcScan: count as before.
  const loaded = usable
    ? (snap ? ARC_APPS.filter(a => getAppWindow(snap, a.id, timeRange as '1h' | '24h' | '7d') !== null).length : 0)
    : (lifetime ? loadedLife : loadedSamples).filter(Boolean).length

  const stamp = usable
    ? (snap?.generatedAt ?? '')
    : (lifetime ? loadedLife : loadedSamples).map(s => s?.fetchedAt ?? 0).join(',') + (lifetime ? 'L' : '')

  const { items, ranksAll } = useMemo(() => {
    const now = Date.now()
    const rankSnap = readSnapshot(timeRange, sortKey)
    const rankUsable = rankSnap && now - rankSnap.ts >= MIN_AGE ? rankSnap : null

    let scored: { app: ArcApp; metrics: AppMetrics }[]

    if (usable && snap) {
      // ── Indexer path ──
      const win = timeRange as '1h' | '24h' | '7d'
      scored = ARC_APPS.flatMap(app => {
        const w = getAppWindow(snap, app.id, win)
        if (!w) return []
        return [{ app, metrics: buildIndexerMetrics(w) }]
      })
    } else {
      // ── ArcScan path (unchanged from original) ──
      scored = ARC_APPS.flatMap((app, i) => {
        if (lifetime) {
          const l = loadedLife[i]
          return l ? [{ app, metrics: lifetimeMetrics(l) }] : []
        }
        const sample = loadedSamples[i]
        return sample ? [{ app, metrics: computeMetrics(sample, RANK_RANGE_MS[timeRange as Exclude<RankRange, 'all'>], now) }] : []
      })
    }

    scored.sort((a, b) => sortValue(b.metrics, sortKey) - sortValue(a.metrics, sortKey))

    const ranksAll: Record<string, number> = {}
    scored.forEach((s, i) => { ranksAll[s.app.id] = i + 1 })

    const visible = scored
      .filter(s => (!opts.kind || opts.kind === 'all' || s.app.kind === opts.kind) && (categoryFilter === 'All' || s.app.category === categoryFilter))
      .map((s, i) => {
        const before = rankUsable?.ranks[s.app.id]
        const rank = i + 1
        return { ...s, rank, metrics: { ...s.metrics, rankChange: before ? before - ranksAll[s.app.id] : 0 } }
      })
    return { items: visible as RankedApp[], ranksAll }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, timeRange, sortKey, categoryFilter, opts.kind, usable])

  // Remember the ranking so a later visit can show movement.
  useEffect(() => {
    if (loaded < ARC_APPS.length) return
    const snap = readSnapshot(timeRange, sortKey)
    if (snap && Date.now() - snap.ts < KEEP_AGE) return
    try {
      localStorage.setItem(SNAP_KEY(timeRange, sortKey), JSON.stringify({ ts: Date.now(), ranks: ranksAll }))
    } catch { /* storage unavailable */ }
  }, [loaded, ranksAll, timeRange, sortKey])

  const totals = items.reduce(
    (acc, { metrics }) => ({
      volume: acc.volume + (metrics.volume ?? 0),
      activeWallets: acc.activeWallets + metrics.activeWallets,
      txCount: acc.txCount + metrics.txCount,
      tvl: acc.tvl + (metrics.tvl ?? 0),
    }),
    { volume: 0, activeWallets: 0, txCount: 0, tvl: 0 },
  )

  const newest = usable
    ? (snap?.generatedAt ? new Date(snap.generatedAt).getTime() : 0)
    : Math.max(0, ...(lifetime ? loadedLife : loadedSamples).map(s => s?.fetchedAt ?? 0))

  const source: 'indexer' | 'arcscan' = usable ? 'indexer' : 'arcscan'

  return {
    items,
    isLoading: usable ? snapLoading : loaded === 0,
    loaded,
    total: ARC_APPS.length,
    lastUpdated: newest ? new Date(newest) : null,
    totals,
    source,
    walletsAreUpperBound: source === 'indexer',
    refresh: () => { void refresh() },
  }
}
