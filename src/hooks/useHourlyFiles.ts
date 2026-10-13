/**
 * Fetches mainnet hourly indexer day-files in parallel.
 *
 * URL pattern:
 *   https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/hourly/YYYY-MM-DD.json
 *
 * - One file per UTC day.
 * - 404 → treated as empty (day not yet published).
 * - fetchWithTimeout is used for every request.
 * - Results are stored in React Query with key ['indexer-hourly', 'mainnet', days]
 *   where days is the sorted YYYY-MM-DD list.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'
import type { HourlyHour } from '@/lib/hourlyApps'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data/mainnet/hourly'

// ── Pure helper: generate UTC day strings ────────────────────────────────────

/**
 * Return the last `n` UTC calendar days (today included) as 'YYYY-MM-DD' strings,
 * oldest first.
 *
 * `nowMs` defaults to `Date.now()` — pass it explicitly in tests for
 * deterministic output.
 *
 * Examples:
 *   lastNUtcDays(1, 1760400000000) → ['2025-10-13']
 *   lastNUtcDays(3, 1760400000000) → ['2025-10-11', '2025-10-12', '2025-10-13']
 */
export function lastNUtcDays(n: number, nowMs: number = Date.now()): string[] {
  if (n <= 0) return []
  const ONE_DAY = 86_400_000
  const days: string[] = []
  // Snap to the start of today in UTC.
  const todayStart = Math.floor(nowMs / ONE_DAY) * ONE_DAY
  for (let i = n - 1; i >= 0; i--) {
    const t = todayStart - i * ONE_DAY
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    days.push(`${y}-${m}-${dd}`)
  }
  return days
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchDayFile(day: string): Promise<Record<string, HourlyHour>> {
  const url = `${BASE}/${day}.json`
  const res = await fetchWithTimeout(url, undefined, 20_000)
  if (res.status === 404) return {}
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.json() as Promise<Record<string, HourlyHour>>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseHourlyFilesResult {
  /** One entry per requested day, in the same order as `days`.  null = not loaded yet. */
  files: (Record<string, HourlyHour> | null)[]
  isLoading: boolean
  isError: boolean
}

/**
 * Fetch the last `n` UTC calendar days' hourly indexer files in parallel.
 *
 * @param n     Number of days to fetch (today counts as 1).
 * @param nowMs Seed for "today" — pass in tests; defaults to Date.now().
 */
export function useHourlyFiles(n: number, nowMs?: number): UseHourlyFilesResult {
  // Compute the day list once at mount / when n or nowMs changes.
  // We do NOT call Date.now() directly during render — capture it in useMemo
  // so the React compiler sees a stable, memoised value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => lastNUtcDays(n, nowMs ?? Date.now()), [n, nowMs])

  const queries = useQueries({
    queries: days.map(day => ({
      queryKey: ['indexer-hourly', 'mainnet', day] as const,
      queryFn: () => fetchDayFile(day),
      staleTime: 5 * 60_000,
      refetchInterval: 10 * 60_000,
      retry: 1,
    })),
  })

  const files = queries.map(q => q.data ?? null)
  const isLoading = queries.some(q => q.isLoading)
  const isError = queries.some(q => q.isError)

  return { files, isLoading, isError }
}
