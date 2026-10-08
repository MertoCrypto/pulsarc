/**
 * Which tracked apps a wallet has used, from ArcScan: its recent transactions to app
 * contracts and its recent token transfers of app tokens.
 */
import { useQuery } from '@tanstack/react-query'
import { ARC_APPS, type ArcApp } from '@/data/apps'
import { arcscan, scaled } from '@/lib/arcscan'

const PAGES = 3

export interface WalletAppActivity {
  app: ArcApp
  txCount: number
  volumeIn: number  // dollars received from the app's USDC-denominated tokens
  volumeOut: number // dollars sent
  lastSeen: string | null
}

export interface WalletProfile {
  topApps: WalletAppActivity[]
  isLoading: boolean
  error: string | null
  scanned: number // events looked at
}

interface Party { hash: string }
interface Tx { timestamp: string; from: Party; to: Party | null; value: string }
interface Transfer {
  timestamp: string
  token: { address_hash: string }
  from: Party
  to: Party
  total?: { value?: string; decimals?: string | null } | null
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
  const me = address.toLowerCase()
  const anchorToApp = new Map<string, { app: ArcApp; usd: boolean }>()
  for (const app of ARC_APPS) for (const a of app.anchors) anchorToApp.set(a.address.toLowerCase(), { app, usd: !!a.usd })

  const [txs, transfers] = await Promise.all([
    pages<Tx>(`/addresses/${address}/transactions`),
    pages<Transfer>(`/addresses/${address}/token-transfers`, { type: 'ERC-20' }),
  ])

  const rows = new Map<string, WalletAppActivity>()
  const row = (app: ArcApp) => {
    let r = rows.get(app.id)
    if (!r) { r = { app, txCount: 0, volumeIn: 0, volumeOut: 0, lastSeen: null }; rows.set(app.id, r) }
    return r
  }
  const seen = (r: WalletAppActivity, ts: string) => { if (!r.lastSeen || ts > r.lastSeen) r.lastSeen = ts }

  for (const t of txs) {
    const hit = t.to ? anchorToApp.get(t.to.hash.toLowerCase()) : undefined
    if (!hit) continue
    const r = row(hit.app)
    r.txCount++
    r.volumeOut += scaled(t.value, 18)
    seen(r, t.timestamp)
  }
  for (const t of transfers) {
    const hit = anchorToApp.get(t.token.address_hash.toLowerCase())
    if (!hit) continue
    const r = row(hit.app)
    r.txCount++
    if (hit.usd) {
      const amount = scaled(t.total?.value, t.total?.decimals ?? 18)
      if (t.from.hash.toLowerCase() === me) r.volumeOut += amount
      else r.volumeIn += amount
    }
    seen(r, t.timestamp)
  }

  return {
    topApps: [...rows.values()].sort((a, b) => b.txCount - a.txCount).slice(0, 10),
    scanned: txs.length + transfers.length,
  }
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
