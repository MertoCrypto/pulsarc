/** Pure conversion of raw ArcScan transfers and transactions into activity events for one anchor. */
import type { Anchor } from '@/data/apps'
import { scaled } from './numberFormat.ts'
import type { ActivityEvent } from './appMetrics.ts'

const ZERO = '0x0000000000000000000000000000000000000000'

export interface Party { hash: string }
export interface RawTransfer {
  timestamp: string
  transaction_hash: string
  from: Party
  to: Party
  total?: { value?: string; decimals?: string | null } | null
}
export interface RawTx {
  timestamp: string
  hash: string
  from: Party
  value: string
  fee?: { value?: string } | null
}

const live = (a: string | undefined) => (a ? a.toLowerCase() : '')

export function transferToEvent(anchor: Pick<Anchor, 'address' | 'usd'>, t: RawTransfer): ActivityEvent {
  return {
    ts: new Date(t.timestamp).getTime(),
    wallets: [live(t.from?.hash), live(t.to?.hash)].filter(a => a && a !== ZERO && a !== live(anchor.address)),
    usd: anchor.usd ? scaled(t.total?.value, t.total?.decimals ?? 18) : null,
    fee: 0,
    hash: t.transaction_hash,
  }
}

export function txToEvent(anchor: Pick<Anchor, 'address'>, t: RawTx): ActivityEvent {
  const native = scaled(t.value, 18)
  return {
    ts: new Date(t.timestamp).getTime(),
    wallets: [live(t.from?.hash)].filter(a => a && a !== live(anchor.address)),
    usd: native > 0 ? native : null,
    fee: scaled(t.fee?.value, 18),
    hash: t.hash,
  }
}
