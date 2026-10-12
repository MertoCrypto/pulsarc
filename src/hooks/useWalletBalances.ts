/**
 * React-Query hook that reads ERC-20 balances for a list of tokens.
 * Uses clientFor(net) from arcRpc — never accesses addresses from anywhere
 * other than the `tokens` argument.
 *
 * staleTime: 60 s, retry: 1, never throws to the UI.
 */
import { useQuery } from '@tanstack/react-query'
import { clientFor } from '@/lib/arcRpc'

// Minimal ERC-20 ABI — only the functions we need.
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

export interface TokenBalance {
  id: string
  raw: bigint
  decimals: number
}

export interface UseWalletBalancesResult {
  data: TokenBalance[] | undefined
  isLoading: boolean
  isError: boolean
}

/**
 * Reads balanceOf + decimals for each token in `tokens` using the viem public
 * client for the given network. Token addresses come exclusively from the
 * `tokens` argument.
 *
 * @param address - The wallet address to check, or null to stay idle.
 * @param net     - 'mainnet' | 'testnet'
 * @param tokens  - List of {id, address} pairs. May be empty.
 */
export function useWalletBalances(
  address: string | null,
  net: 'mainnet' | 'testnet',
  tokens: { id: string; address: string }[],
): UseWalletBalancesResult {
  const tokenIds = tokens.map(t => t.id).join(',')

  const query = useQuery({
    queryKey: ['wallet-balances', address, net, tokenIds],
    enabled: address !== null && tokens.length > 0,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<TokenBalance[]> => {
      if (!address) return []
      const client = clientFor(net)

      const results = await Promise.allSettled(
        tokens.map(async token => {
          const [raw, decimals] = await Promise.all([
            client.readContract({
              address: token.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            }),
            client.readContract({
              address: token.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'decimals',
            }),
          ])
          return { id: token.id, raw: raw as bigint, decimals: decimals as number }
        }),
      )

      return results
        .map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : { id: tokens[i].id, raw: null as unknown as bigint, decimals: 0, error: true },
        )
        .filter((r): r is TokenBalance => (r as { error?: boolean }).error !== true)
    },
  })

  return {
    data: query.data,
    isLoading: query.isPending,
    isError: query.isError,
  }
}
