/**
 * React Query hook for the Pulsarc wallet distribution (dist.json).
 * Fetches from the wallets-<net> branch of the pulsarc-indexer repo.
 * - 404 → returns null (not published yet); not treated as an error.
 * - non-OK → throws so react-query retries once.
 * - Parses the response with parseDist; invalid shape → null.
 */
import { useQuery } from '@tanstack/react-query'
import { parseDist, type WalletDist } from '@/lib/walletDist'

type Net = 'mainnet' | 'testnet'

const BASE = 'https://raw.githubusercontent.com/MertoCrypto/pulsarc-indexer'

function distUrl(net: Net): string {
  return `${BASE}/wallets-${net}/dist.json`
}

export function useWalletDist(net: Net) {
  return useQuery<WalletDist | null>({
    queryKey: ['wallet-dist', net],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<WalletDist | null> => {
      const res = await fetch(distUrl(net))
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`dist.json: HTTP ${res.status}`)
      const raw: unknown = await res.json()
      return parseDist(raw)
    },
  })
}
