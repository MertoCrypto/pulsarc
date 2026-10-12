import { useCallback, useEffect, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { toWalletSnapshot, type RawAddress, type RawCounters, type RawTxPage, type WalletSnapshot } from '@/lib/walletSnapshot'
import { addTracked, parseTracked, removeTracked, type AddResult, type TrackedWallet } from '@/lib/trackedWallets'

const KEY = 'pulsarc.trackedWallets.v1'
export { MAX_WALLETS, type TrackedWallet } from '@/lib/trackedWallets'

function read(): TrackedWallet[] {
  try {
    return parseTracked(localStorage.getItem(KEY))
  } catch {
    return []
  }
}

/** Watch-list kept in this browser only — no account, nothing sent anywhere. */
export function useTrackedWallets() {
  const [wallets, setWallets] = useState<TrackedWallet[]>(read)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(wallets)) } catch { /* private mode */ }
  }, [wallets])

  const add = useCallback((address: string, label: string): AddResult => {
    const { next, result } = addTracked(wallets, address, label, Date.now())
    if (result === 'ok') setWallets(next)
    return result
  }, [wallets])

  const remove = useCallback((address: string) => {
    setWallets(prev => removeTracked(prev, address))
  }, [])

  return { wallets, add, remove }
}

export type { WalletSnapshot } from '@/lib/walletSnapshot'

async function snapshot(address: string): Promise<WalletSnapshot> {
  const [info, counters, txs] = await Promise.all([
    arcscan<RawAddress>(`/addresses/${address}`),
    arcscan<RawCounters>(`/addresses/${address}/counters`),
    arcscan<RawTxPage>(`/addresses/${address}/transactions`),
  ])
  return toWalletSnapshot(address, info, counters, txs, Date.now())
}

export function useWalletSnapshots(addresses: string[]) {
  return useQueries({
    queries: addresses.map(address => ({
      queryKey: ['wallet-snapshot', address.toLowerCase()],
      queryFn: () => snapshot(address),
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: 1,
    })),
  })
}
