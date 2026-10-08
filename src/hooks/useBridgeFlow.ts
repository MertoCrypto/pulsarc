import { useQuery } from '@tanstack/react-query'
import { arcscan, scaled } from '@/lib/arcscan'

export const TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'
const USDC = '0x3600000000000000000000000000000000000000'

// CCTP v2 domain IDs published by Circle.
const DOMAINS: Record<number, string> = {
  0: 'Ethereum', 1: 'Avalanche', 2: 'OP Mainnet', 3: 'Arbitrum', 5: 'Solana', 6: 'Base', 7: 'Polygon PoS',
  10: 'Unichain', 11: 'Linea', 12: 'Codex', 13: 'Sonic', 14: 'World Chain',
}
export const domainName = (id: number) => DOMAINS[id] ?? `Domain ${id}`

interface Param { name: string; value: string }
interface LogItem { block_number: number; decoded?: { method_call?: string; parameters?: Param[] } | null }
interface Page { items: LogItem[]; next_page_params: Record<string, unknown> | null }

export interface BridgeFlow {
  outCount: number
  outUsdc: number
  inCount: number
  inUsdc: number
  feesUsdc: number
  byDestination: { domain: number; name: string; usdc: number; count: number }[]
  blockSpan: number // newest − oldest block read, to size the window
}

async function load(): Promise<BridgeFlow> {
  const items: LogItem[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < 4; i++) {
    const page: Page = await arcscan<Page>(`/addresses/${TOKEN_MESSENGER}/logs`, cursor ?? undefined)
    items.push(...page.items)
    cursor = page.next_page_params
    if (!cursor) break
  }

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

/** USDC crossing Arc through CCTP v2, from the TokenMessenger's newest events. */
export function useBridgeFlow() {
  return useQuery({ queryKey: ['bridge-flow'], queryFn: load, staleTime: 2 * 60_000, retry: 1 })
}
