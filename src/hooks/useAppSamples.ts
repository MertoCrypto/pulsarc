import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { lifetimeOf, sampleApp, type AppLifetime, type AppSample, type RankRange } from '@/lib/appActivity'
import { ARC_APPS, type ArcApp } from '@/data/apps'

/** Pages of newest activity read per anchor: enough for the lists, more for a single app. */
export const LIST_PAGES = 2
export const DETAIL_PAGES = 6

const DAY = 24 * 3600_000

/** How deep to read for each range: wider ranges read more pages, and refresh less often. */
export const READ_PLAN: Record<Exclude<RankRange, 'all'>, { pages: number; horizon: number; every: number }> = {
  '1h':  { pages: LIST_PAGES, horizon: 2 * DAY, every: 120_000 },
  '24h': { pages: LIST_PAGES, horizon: 2 * DAY, every: 120_000 },
  '7d':  { pages: 6, horizon: 14 * DAY, every: 600_000 },
  '30d': { pages: 8, horizon: 60 * DAY, every: 600_000 },
}

const key = (id: string, pages: number, horizon = 2 * DAY) => ['app-sample', id, pages, horizon] as const

/** Apps people use are read before the tokens they hold, and in list order. */
const priorityOf = (app: ArcApp) => ARC_APPS.indexOf(app) + (app.kind === 'app' ? 0 : 100)

const options = (app: ArcApp, pages: number, horizon = 2 * DAY, every = 120_000) => ({
  queryKey: key(app.id, pages, horizon),
  queryFn: () => sampleApp(app, pages, horizon, priorityOf(app)),
  staleTime: Math.min(every, 90_000) || 90_000,
  refetchInterval: every,
  retry: 1,
})

export function useAppSample(app: ArcApp | undefined, pages: number) {
  return useQuery({
    ...options(app ?? ARC_APPS[0], pages),
    enabled: !!app,
  })
}

export function useAppSamples(apps: ArcApp[], pages: number, enabled = true, horizon?: number, every?: number) {
  return useQueries({ queries: apps.map(a => ({ ...options(a, pages, horizon, every), enabled })) })
}

/** Lifetime counters (all-time view). */
export function useAppLifetimes(apps: ArcApp[], enabled: boolean) {
  return useQueries({
    queries: apps.map(a => ({
      queryKey: ['app-lifetime', a.id] as const,
      queryFn: () => lifetimeOf(a, priorityOf(a)),
      staleTime: 5 * 60_000,
      refetchInterval: 10 * 60_000,
      retry: 1,
      enabled,
    })),
  })
}

export function useRefreshSamples() {
  const client = useQueryClient()
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ['app-sample'] }),
    client.invalidateQueries({ queryKey: ['app-lifetime'] }),
  ])
}

export type { AppSample, AppLifetime }
