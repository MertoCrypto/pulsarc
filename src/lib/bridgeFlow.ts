/** Pure CCTP v2 bridge-flow summary from TokenMessenger log events (no network here). */
import { scaled } from './numberFormat.ts'

export const USDC = '0x3600000000000000000000000000000000000000'

// Source: Circle developer docs, 'CCTP supported blockchains and domains' page (checked 2026-10-23).
// -1 is a sentinel used by the indexer for arrivals whose source domain is unknown.
export const CCTP_DOMAINS: Record<number, string> = {
  [-1]: 'Unknown source',
  0:  'Ethereum',
  1:  'Avalanche',
  2:  'OP Mainnet',
  3:  'Arbitrum',
  4:  'Noble',       // V1 only
  5:  'Solana',
  6:  'Base',
  7:  'Polygon PoS',
  8:  'Sui',
  9:  'Aptos',
  10: 'Unichain',
  11: 'Linea',
  12: 'Codex',
  13: 'Sonic',
  14: 'World Chain',
  15: 'Monad',
  16: 'Sei',
  17: 'BNB Smart Chain',
  18: 'XDC',
  19: 'HyperEVM',
  21: 'Ink',
  22: 'Plume',
  25: 'Starknet',
  26: 'Arc',
  27: 'Stellar',
  28: 'EDGE',
  29: 'Injective',
  30: 'Morph',
  31: 'Pharos',
  32: 'Cronos',
  33: 'Plasma',
  37: 'X Layer',
}

export const domainName = (id: number): string => CCTP_DOMAINS[id] ?? `Domain ${id}`

export interface Param { name: string; value: string }
export interface LogItem { block_number: number; decoded?: { method_call?: string; parameters?: Param[] } | null }

export interface BridgeFlow {
  outCount: number
  outUsdc: number
  inCount: number
  inUsdc: number
  feesUsdc: number
  byDestination: { domain: number; name: string; usdc: number; count: number }[]
  blockSpan: number // newest − oldest block read, to size the window
}

export function summarizeBridgeLogs(items: readonly LogItem[]): BridgeFlow {
  let outCount = 0, outUsdc = 0, inCount = 0, inUsdc = 0, fees = 0
  const dest = new Map<number, { usdc: number; count: number }>()
  for (const l of items) {
    const kind = l.decoded?.method_call?.split('(')[0]
    const p = Object.fromEntries((l.decoded?.parameters ?? []).map(x => [x.name, x.value]))
    if (kind === 'DepositForBurn' && String(p.burnToken).toLowerCase() === USDC) {
      const amt = scaled(p.amount, 6)
      outCount++; outUsdc += amt
      const d = Number(p.destinationDomain)
      const row = dest.get(d) ?? { usdc: 0, count: 0 }
      row.usdc += amt; row.count++
      dest.set(d, row)
    } else if (kind === 'MintAndWithdraw' && String(p.mintToken).toLowerCase() === USDC) {
      inCount++; inUsdc += scaled(p.amount, 6); fees += scaled(p.feeCollected, 6)
    }
  }

  const blocks = items.map(i => i.block_number)
  return {
    outCount, outUsdc, inCount, inUsdc, feesUsdc: fees,
    byDestination: [...dest.entries()].map(([domain, v]) => ({ domain, name: domainName(domain), ...v })).sort((a, b) => b.usdc - a.usdc),
    blockSpan: blocks.length ? Math.max(...blocks) - Math.min(...blocks) : 0,
  }
}
