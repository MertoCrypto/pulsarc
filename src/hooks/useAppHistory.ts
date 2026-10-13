import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { appById, type ArcApp } from '@/data/apps'
import { buildHistory, computeMetrics, RANGE_MS, sampleApp, type AppMetrics, type History, type HistoryPoint, type TimeRange } from '@/lib/appActivity'
import { DETAIL_PAGES, useAppSample } from '@/hooks/useAppSamples'
import { NETWORK } from '@/lib/chain'
import { useAppHistoryMainnet, useCompareHistoryMainnet } from '@/hooks/useAppHistoryMainnet'

export type { HistoryPoint }

const EMPTY: History = { perApp: {}, total: [], coveredMs: 0, complete: true }

/** One app: its metrics and history chart data, read deeper than the ranking list does. */
function useAppHistoryArcscan(appId: string, timeRange: TimeRange) {
  const app = appById(appId)
  const { data: sample, isLoading, isError } = useAppSample(app, DETAIL_PAGES)

  const result = useMemo(() => {
    if (!sample) return { history: EMPTY, metrics: null as AppMetrics | null }
    const now = Date.now()
    return {
      history: buildHistory([sample], RANGE_MS[timeRange], now),
      metrics: computeMetrics(sample, RANGE_MS[timeRange], now),
    }
  }, [sample, timeRange])

  return { ...result, isLoading, isError, sample }
}

/** Several apps on one shared timeline. */
function useCompareHistoryArcscan(apps: ArcApp[], timeRange: TimeRange) {
  const queries = useQueries({
    queries: apps.map(a => ({
      queryKey: ['app-sample', a.id, 3] as const,
      queryFn: () => sampleApp(a, 3),
      staleTime: 90_000,
      retry: 1,
    })),
  })
  const stamp = queries.map(q => q.data?.fetchedAt ?? 0).join(',')

  const { history, metrics } = useMemo(() => {
    const now = Date.now()
    const samples = queries.flatMap(q => (q.data ? [q.data] : []))
    return {
      history: samples.length ? buildHistory(samples, RANGE_MS[timeRange], now) : EMPTY,
      metrics: Object.fromEntries(samples.map(sm => [sm.appId, computeMetrics(sm, RANGE_MS[timeRange], now)])) as Record<string, AppMetrics>,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, timeRange])

  return { history, metrics, isLoading: queries.some(q => q.isLoading) }
}

// ── Network-level selector ────────────────────────────────────────────────────
//
// Module-level constant — not computed inside a render function — so React's
// hook rules are never violated: both branches are always the same hook for
// the lifetime of the app.
//
// Arc Mainnet chain ID = 5042 (from src/lib/chain.ts NETWORKS.mainnet.id)

const IS_MAINNET = NETWORK.id === 5042

export const useAppHistory: typeof useAppHistoryArcscan =
  IS_MAINNET ? useAppHistoryMainnet : useAppHistoryArcscan

export const useCompareHistory: typeof useCompareHistoryArcscan =
  IS_MAINNET ? useCompareHistoryMainnet : useCompareHistoryArcscan
