/** Pure CCTP v2 bridge-flow summary from TokenMessenger log events (no network here). */
import { scaled } from './numberFormat.ts'

export const USDC = '0x3600000000000000000000000000000000000000'

// CCTP v2 domain IDs published by Circle.
const DOMAINS: Record<number, string> = {
  0: 'Ethereum', 1: 'Avalanche', 2: 'OP Mainnet', 3: 'Arbitrum', 5: 'Solana', 6: 'Base', 7: 'Polygon PoS',
  10: 'Unichain', 11: 'Linea', 12: 'Codex', 13: 'Sonic', 14: 'World Chain',
}
export const domainName = (id: number) => DOMAINS[id] ?? `Domain ${id}`

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
