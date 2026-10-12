import { useQuery } from '@tanstack/react-query'
import { clientFor } from '@/lib/arcRpc'
import { toLiveFacts, type LiveFacts } from '@/lib/walletLive'

/** Live native balance, sent-transaction count and contract flag, straight from the Arc RPC. */
export function useWalletLive(address: string | null, net: 'mainnet' | 'testnet') {
  return useQuery<LiveFacts | null>({
    queryKey: ['wallet-live', address, net],
    enabled: address !== null,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<LiveFacts | null> => {
      const client = clientFor(net)
      const a = address as `0x${string}`
      const [balance, nonce, code] = await Promise.all([
        client.getBalance({ address: a }),
        client.getTransactionCount({ address: a }),
        client.getCode({ address: a }),
      ])
      return toLiveFacts({ balance, nonce, code })
    },
  })
}
