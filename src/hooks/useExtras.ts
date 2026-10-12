import { useQuery } from '@tanstack/react-query'
import { parseSupply, parseBridge } from '@/lib/activityMix'
import type { SupplyJson, BridgeJson } from '@/lib/activityMix'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

// Re-export types for consumers
export type { SupplyJson, BridgeJson, ExtendedWindow, AutoField, MbField, BridgeWindowField } from '@/lib/activityMix'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer/data'

/**
 * Fetches supply.json for USDC and EURC supply data.
 * Returns null while loading, on error, or when response is not OK.
 */
export function useSupply(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['supply', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<SupplyJson | null> => {
      const res = await fetchWithTimeout(`${BASE}/${net}/supply.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseSupply(json)
    },
  })
}

/**
 * Fetches bridge.json for bridge flow data.
 * Returns null while loading, on error, or when response is not OK.
 */
export function useBridgeData(net: 'mainnet' | 'testnet') {
  return useQuery({
    queryKey: ['bridge-data', net],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<BridgeJson | null> => {
      const res = await fetchWithTimeout(`${BASE}/${net}/bridge.json`)
      if (!res.ok) return null
      const json: unknown = await res.json()
      return parseBridge(json)
    },
  })
}
