import { useEffect, useMemo, useState } from 'react'
import { ARC_APPS, type AppKind, type ArcApp } from '@/data/apps'
import { READ_PLAN, useAppLifetimes, useAppSamples, useRefreshSamples } from '@/hooks/useAppSamples'
import { computeMetrics, lifetimeMetrics, RANK_RANGE_MS, type AppMetrics, type RankRange } from '@/lib/appActivity'

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
}

const SNAP_KEY = (range: string, sort: string) => `arclytics.rankSnap.v1:${range}:${sort}`
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
 * Real activity for every tracked app, read from ArcScan. Rows appear as each app finishes
 * loading. `rankChange` compares with the ranking this browser saw at least 5 minutes ago.
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
  const lifetime = timeRange === 'all'
  const plan = READ_PLAN[lifetime ? '24h' : timeRange]
  const queries = useAppSamples(ARC_APPS, plan.pages, ready && !lifetime, plan.horizon, plan.every)
  const lifetimes = useAppLifetimes(ARC_APPS, ready && lifetime)
  const refresh = useRefreshSamples()

  const loadedSamples = queries.map(q => q.data)
  const loadedLife = lifetimes.map(q => q.data)
  const loaded = (lifetime ? loadedLife : loadedSamples).filter(Boolean).length
  const stamp = (lifetime ? loadedLife : loadedSamples).map(s => s?.fetchedAt ?? 0).join(',') + (lifetime ? 'L' : '')

  const { items, ranksAll } = useMemo(() => {
    const now = Date.now()
    const snap = readSnapshot(timeRange, sortKey)
    const usable = snap && now - snap.ts >= MIN_AGE ? snap : null

    const scored = ARC_APPS.flatMap((app, i) => {
      if (lifetime) {
        const l = loadedLife[i]
        return l ? [{ app, metrics: lifetimeMetrics(l) }] : []
      }
      const sample = loadedSamples[i]
      return sample ? [{ app, metrics: computeMetrics(sample, RANK_RANGE_MS[timeRange as Exclude<RankRange, 'all'>], now) }] : []
    })
    scored.sort((a, b) => sortValue(b.metrics, sortKey) - sortValue(a.metrics, sortKey))

    const ranksAll: Record<string, number> = {}
    scored.forEach((s, i) => { ranksAll[s.app.id] = i + 1 })

    const visible = scored
      .filter(s => (!opts.kind || opts.kind === 'all' || s.app.kind === opts.kind) && (categoryFilter === 'All' || s.app.category === categoryFilter))
      .map((s, i) => {
        const before = usable?.ranks[s.app.id]
        const rank = i + 1
        return { ...s, rank, metrics: { ...s.metrics, rankChange: before ? before - ranksAll[s.app.id] : 0 } }
      })
    return { items: visible as RankedApp[], ranksAll }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, timeRange, sortKey, categoryFilter, opts.kind])

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

  const newest = Math.max(0, ...(lifetime ? loadedLife : loadedSamples).map(s => s?.fetchedAt ?? 0))

  return {
    items,
    isLoading: loaded === 0,
    loaded,
    total: ARC_APPS.length,
    lastUpdated: newest ? new Date(newest) : null,
    totals,
    refresh: () => { void refresh() },
  }
}
