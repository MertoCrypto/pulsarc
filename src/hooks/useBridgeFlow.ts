import { useQuery } from '@tanstack/react-query'
import { arcscan } from '@/lib/arcscan'
import { summarizeBridgeLogs, type BridgeFlow, type LogItem } from '@/lib/bridgeFlow'

export const TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'
export { domainName, type BridgeFlow } from '@/lib/bridgeFlow'

interface Page { items: LogItem[]; next_page_params: Record<string, unknown> | null }

async function load(): Promise<BridgeFlow> {
  const items: LogItem[] = []
  let cursor: Record<string, unknown> | null = null
  for (let i = 0; i < 4; i++) {
    const page: Page = await arcscan<Page>(`/addresses/${TOKEN_MESSENGER}/logs`, cursor ?? undefined)
    items.push(...page.items)
    cursor = page.next_page_params
    if (!cursor) break
  }

  return summarizeBridgeLogs(items)
}

/** USDC crossing Arc through CCTP v2, from the TokenMessenger's newest events. */
export function useBridgeFlow() {
  return useQuery({ queryKey: ['bridge-flow'], queryFn: load, staleTime: 2 * 60_000, retry: 1 })
}
