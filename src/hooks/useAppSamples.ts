import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { sampleApp, type AppSample } from '@/lib/appActivity'
import { ARC_APPS, type ArcApp } from '@/data/apps'

/** Pages of newest activity read per anchor: enough for the lists, more for a single app. */
export const LIST_PAGES = 2
export const DETAIL_PAGES = 6

const key = (id: string, pages: number) => ['app-sample', id, pages] as const

const options = (app: ArcApp, pages: number) => ({
  queryKey: key(app.id, pages),
  queryFn: () => sampleApp(app, pages),
  staleTime: 90_000,
  refetchInterval: 120_000,
  retry: 1,
})

export function useAppSample(app: ArcApp | undefined, pages: number) {
  return useQuery({
    ...options(app ?? ARC_APPS[0], pages),
    enabled: !!app,
  })
}

export function useAppSamples(apps: ArcApp[], pages: number, enabled = true) {
  return useQueries({ queries: apps.map(a => ({ ...options(a, pages), enabled })) })
}

export function useRefreshSamples() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['app-sample'] })
}

export type { AppSample }
