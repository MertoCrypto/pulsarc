/**
 * React-Query hooks for DefiLlama data.
 * All fetches go through same-origin proxy prefixes to avoid ad-blocker issues.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'
import {
  parseChainSeries,
  parseOverview,
  parseStablecoins,
  type SeriesPoint,
  type OverviewResult,
  type StablecoinsResult,
} from '@/lib/llama'
import { NETWORK } from '@/lib/chain'

const STALE_5MIN = 5 * 60 * 1000

async function getJson(url: string): Promise<unknown> {
  const res = await fetchWithTimeout(url, undefined, 15000)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// useChainTvl
// ---------------------------------------------------------------------------

export function useChainTvl() {
  const net = NETWORK.id
  return useQuery<SeriesPoint[]>({
    queryKey: ['llama-chain-tvl', net],
    queryFn: async () => {
      const json = await getJson(`/llama-api/v2/historicalChainTvl/Arc`)
      return parseChainSeries(json)
    },
    staleTime: STALE_5MIN,
    retry: 1,
  })
}

// ---------------------------------------------------------------------------
// useFees
// ---------------------------------------------------------------------------

export function useFees() {
  const net = NETWORK.id
  return useQuery<OverviewResult>({
    queryKey: ['llama-fees', net],
    queryFn: async () => {
      const json = await getJson(
        `/llama-api/overview/fees/Arc?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true`,
      )
      return parseOverview(json)
    },
    staleTime: STALE_5MIN,
    retry: 1,
  })
}

// ---------------------------------------------------------------------------
// useDexs
// ---------------------------------------------------------------------------

export function useDexs() {
  const net = NETWORK.id
  return useQuery<OverviewResult>({
    queryKey: ['llama-dexs', net],
    queryFn: async () => {
      const json = await getJson(
        `/llama-api/overview/dexs/Arc?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true`,
      )
      return parseOverview(json)
    },
    staleTime: STALE_5MIN,
    retry: 1,
  })
}

// ---------------------------------------------------------------------------
// useStablecoins
// ---------------------------------------------------------------------------

export function useStablecoins() {
  const net = NETWORK.id
  return useQuery<StablecoinsResult>({
    queryKey: ['llama-stablecoins', net],
    queryFn: async () => {
      const json = await getJson(`/llama-stables/stablecoincharts/Arc`)
      return parseStablecoins(json)
    },
    staleTime: STALE_5MIN,
    retry: 1,
  })
}
