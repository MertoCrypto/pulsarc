/** Pure summary of which tracked apps a wallet used, from its ArcScan transactions and token transfers. */
import type { ArcApp } from '@/data/apps'
import { scaled } from './numberFormat.ts'

export interface WalletAppActivity {
  app: ArcApp
  txCount: number
  volumeIn: number  // dollars received from the app's USDC-denominated tokens
  volumeOut: number // dollars sent
  lastSeen: string | null
}

export interface Party { hash: string }
export interface Tx { timestamp: string; from: Party; to: Party | null; value: string }
export interface Transfer {
  timestamp: string
  token: { address_hash: string }
  from: Party
  to: Party
  total?: { value?: string; decimals?: string | null } | null
}

export function summarizeWalletApps(
  address: string,
  apps: readonly ArcApp[],
  txs: readonly Tx[],
  transfers: readonly Transfer[],
): { topApps: WalletAppActivity[]; scanned: number } {
  const me = address.toLowerCase()
  const anchorToApp = new Map<string, { app: ArcApp; usd: boolean }>()
  for (const app of apps) for (const a of app.anchors) anchorToApp.set(a.address.toLowerCase(), { app, usd: !!a.usd })

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
