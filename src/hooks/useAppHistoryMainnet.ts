/**
 * Mainnet drop-in for useAppHistory / useCompareHistory.
 *
 * Data source: hourly indexer day-files via useHourlyFiles (2 days for both
 * 1h and 24h windows — today + yesterday covers the full 24h window and any
 * current-hour partial read).
 *
 * Return shapes are IDENTICAL to useAppHistory and useCompareHistory so that
 * the module-level selector in useAppHistory.ts can switch transparently:
 *
 *   useAppHistoryMainnet  → { history, metrics: AppMetrics|null, isLoading, isError, sample }
 *   useCompareHistoryMainnet → { history, metrics: Record<string,AppMetrics>, isLoading }
 *
 * Differences from the ArcScan-backed hooks:
 *  - `sample` is always undefined (no AnchorSample data — hourly files don't
 *    carry raw events or balances).
 *  - `metrics.tvl` is always null.
 *  - `metrics.rankChange` is always 0; `metrics.trend` is always null.
 *  - `metrics.activeWallets` is the SUM of per-hour wallet counts across the
 *    window — an UPPER BOUND because the same wallet may appear in multiple
 *    hours.  `metrics.estimated` is set to true whenever coverage is partial
 *    OR to flag this upper-bound nature of activeWallets.
 *  - `history.perApp` / `history.total` labels are 'HH:00'.
 */
import { useMemo } from 'react'
import { type ArcApp } from '@/data/apps'
import type { AppMetrics, History, TimeRange } from '@/lib/appActivity'
import { useHourlyFiles } from '@/hooks/useHourlyFiles'
import { buildHourlyHistory } from '@/lib/hourlyHistory'
import type { HourlyHour } from '@/lib/hourlyApps'

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGE_MS: Record<TimeRange, number> = { '1h': 3_600_000, '24h': 86_400_000 }

/** Fetch 2 days for both windows: covers today + yesterday = full 24h + overflow. */
const DAYS_TO_FETCH = 2

// ── Shared helper ─────────────────────────────────────────────────────────────

function nonNullFiles(files: (Record<string, HourlyHour> | null)[]): Record<string, HourlyHour>[] {
  return files.filter((f): f is Record<string, HourlyHour> => f !== null)
}

// ── useAppHistoryMainnet ───────────────────────────────────────────────────────

/** One app: metrics and history chart data, backed by the hourly indexer. */
export function useAppHistoryMainnet(appId: string, timeRange: TimeRange) {
  const { files, isLoading, isError } = useHourlyFiles(DAYS_TO_FETCH)

  const result = useMemo(() => {
    const loaded = nonNullFiles(files)
    if (loaded.length === 0) {
      const EMPTY: History = { perApp: {}, total: [], coveredMs: 0, complete: true }
      return { history: EMPTY, metrics: null as AppMetrics | null }
    }

    const now = Date.now()
    const windowMs = RANGE_MS[timeRange]
    const { history, metricsPerApp } = buildHourlyHistory(loaded, [appId], windowMs, now)
    const metrics = metricsPerApp[appId] ?? null

    return { history, metrics: metrics as AppMetrics | null }
  }, [files, appId, timeRange])

  return {
    ...result,
    isLoading,
    isError,
    // sample is undefined: hourly files have no raw event/balance data
    sample: undefined as undefined,
  }
}

// ── useCompareHistoryMainnet ───────────────────────────────────────────────────

/** Several apps on one shared timeline, backed by the hourly indexer. */
export function useCompareHistoryMainnet(apps: ArcApp[], timeRange: TimeRange) {
  const { files, isLoading } = useHourlyFiles(DAYS_TO_FETCH)

  const appIds = apps.map(a => a.id)
  const appIdsKey = appIds.join(',')

  const { history, metrics } = useMemo(() => {
    const loaded = nonNullFiles(files)
    const EMPTY: History = { perApp: {}, total: [], coveredMs: 0, complete: true }

    if (loaded.length === 0 || appIds.length === 0) {
      return {
        history: EMPTY,
        metrics: {} as Record<string, AppMetrics>,
      }
    }

    const now = Date.now()
    const windowMs = RANGE_MS[timeRange]
    const { history: h, metricsPerApp } = buildHourlyHistory(loaded, appIds, windowMs, now)

    return {
      history: h,
      metrics: metricsPerApp as Record<string, AppMetrics>,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, appIdsKey, timeRange])

  return { history, metrics, isLoading }
}
