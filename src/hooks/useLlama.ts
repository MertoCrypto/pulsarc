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
import { parseChainAssets, parseChainDex, buildChainSizes, type ChainSize } from '@/lib/chainSizes'
import { PORT_DOMAINS } from '@/lib/chainPorts'

/** Fallback chain sizes: all at weight 0.5 so bodies still render when data is unavailable. */
function fallbackSizes(): ChainSize[] {
  const FALLBACK_WEIGHT = 0.5
  return PORT_DOMAINS.map(domain => ({
    domain,
    assets: null,
    dex24h: null,
    weight: FALLBACK_WEIGHT,
    radius: 14 + FALLBACK_WEIGHT * 32,
    radiusMobile: 10 + FALLBACK_WEIGHT * 20,
  }))
}

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

// ---------------------------------------------------------------------------
// useChainSizes
// ---------------------------------------------------------------------------

export interface ChainSizesResult {
  sizes: ChainSize[]
  /** True when data came from DefiLlama; false when falling back to equal weights. */
  live: boolean
}

export function useChainSizes() {
  return useQuery<ChainSizesResult>({
    queryKey: ['llama-chain-sizes'],
    queryFn: async () => {
      try {
        const [chainsJson, metaJson] = await Promise.all([
          getJson('/llama-api/v2/chains'),
          getJson('/llama-api/config/smol/appMetadata-chains.json'),
        ])
        const assetsMap = parseChainAssets(chainsJson)
        const dexMap = parseChainDex(metaJson)
        const sizes = buildChainSizes(assetsMap, dexMap)
        return { sizes, live: true }
      } catch {
        return { sizes: fallbackSizes(), live: false }
      }
    },
    staleTime: STALE_5MIN,
    retry: 1,
  })
}
