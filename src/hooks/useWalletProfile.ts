/**
 * Which tracked apps a wallet has used, from ArcScan: its recent transactions to app
 * contracts and its recent token transfers of app tokens.
 */
import { useQuery } from '@tanstack/react-query'
import { ARC_APPS } from '@/data/apps'
import { arcscan } from '@/lib/arcscan'
import { summarizeWalletApps, type Transfer, type Tx, type WalletAppActivity } from '@/lib/walletApps'

const PAGES = 3

export type { WalletAppActivity } from '@/lib/walletApps'

export interface WalletProfile {
  topApps: WalletAppActivity[]
  isLoading: boolean
  error: string | null
  scanned: number // events looked at
}

interface Page<T> { items: T[]; next_page_params: Record<string, unknown> | null }

async function pages<T>(path: string, extra?: Record<string, unknown>): Promise<T[]> {
  const out: T[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < PAGES; i++) {
    const page: Page<T> = await arcscan<Page<T>>(path, { ...extra, ...(cursor ?? {}) })
    out.push(...page.items)
    cursor = page.next_page_params
    if (!cursor) break
  }
  return out
}

export async function loadWalletApps(address: string): Promise<{ topApps: WalletAppActivity[]; scanned: number }> {
  const [txs, transfers] = await Promise.all([
    pages<Tx>(`/addresses/${address}/transactions`),
    pages<Transfer>(`/addresses/${address}/token-transfers`, { type: 'ERC-20' }),
  ])

  return summarizeWalletApps(address, ARC_APPS, txs, transfers)
}

export function useWalletProfile(address: string | null) {
  const q = useQuery({
    queryKey: ['wallet-apps', address?.toLowerCase()],
    queryFn: () => loadWalletApps(address as string),
    enabled: !!address && /^0x[0-9a-fA-F]{40}$/.test(address),
    staleTime: 60_000,
    retry: 1,
  })

  const profile: WalletProfile | null = address
    ? {
        topApps: q.data?.topApps ?? [],
        isLoading: q.isLoading,
        error: q.isError ? 'ArcScan did not answer for this wallet.' : null,
        scanned: q.data?.scanned ?? 0,
      }
    : null

  return { profile, reload: () => { void q.refetch() } }
}
