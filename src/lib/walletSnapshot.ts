/** Pure summary of one tracked wallet from three ArcScan answers. */
import { scaled } from './numberFormat.ts'

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

export interface RawAddress {
  coin_balance: string | null
  is_contract: boolean
  name: string | null
}
export interface RawCounters {
  transactions_count: string
  token_transfers_count: string
}
export interface RawTxPage {
  items: { timestamp: string }[]
}

export function toWalletSnapshot(address: string, info: RawAddress, counters: RawCounters, txs: RawTxPage, nowMs: number): WalletSnapshot {
  const since = nowMs - 24 * 3600_000
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
