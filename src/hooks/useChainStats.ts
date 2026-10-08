import { useState, useEffect } from 'react'
import { createPublicClient, http } from 'viem'
import { NETWORKS, RPC_URL } from '@/lib/chain'

/**
 * Latest block number, polled lightly. Throughput lives in useNetworkStats, which counts
 * the real transactions in each block instead of estimating.
 */
export function useChainStats(net?: 'testnet' | 'mainnet') {
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null)

  useEffect(() => {
    setBlockNumber(null)
    const client = createPublicClient({ transport: http(net ? NETWORKS[net].rpcUrl : RPC_URL) })

    async function poll() {
      try {
        setBlockNumber(await client.getBlockNumber())
      } catch {
        // keep the last known block on RPC errors
      }
    }

    void poll()
    const interval = setInterval(() => { void poll() }, 6000)
    return () => clearInterval(interval)
  }, [net])

  return { blockNumber }
}
