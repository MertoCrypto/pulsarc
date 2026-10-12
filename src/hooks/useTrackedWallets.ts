import { useCallback, useEffect, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { arcscan, scaled } from '@/lib/arcscan'
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

export interface WalletSnapshot {
  address: string
  balance: number // native USDC
  isContract: boolean
  name: string | null
  txCount: number
  transferCount: number
  lastActive: string | null
  txns24h: number
  txns24hCapped: boolean
}

interface RawAddress {
  coin_balance: string | null
  is_contract: boolean
  name: string | null
}
interface RawCounters {
  transactions_count: string
  token_transfers_count: string
}
interface RawTxPage {
  items: { timestamp: string }[]
}

async function snapshot(address: string): Promise<WalletSnapshot> {
  const [info, counters, txs] = await Promise.all([
    arcscan<RawAddress>(`/addresses/${address}`),
    arcscan<RawCounters>(`/addresses/${address}/counters`),
    arcscan<RawTxPage>(`/addresses/${address}/transactions`),
  ])
  const since = Date.now() - 24 * 3600_000
  const recent = txs.items.filter(t => new Date(t.timestamp).getTime() >= since)
  return {
    address,
    balance: scaled(info.coin_balance, 18), // native USDC uses 18 decimals
    isContract: info.is_contract,
    name: info.name,
    txCount: Number(counters.transactions_count),
    transferCount: Number(counters.token_transfers_count),
    lastActive: txs.items[0]?.timestamp ?? null,
    txns24h: recent.length,
    txns24hCapped: txs.items.length >= 50 && recent.length === txs.items.length,
  }
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
