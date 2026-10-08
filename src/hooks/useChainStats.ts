import { useState, useEffect } from 'react'
import { createPublicClient, http } from 'viem'
import { RPC_URL } from '@/lib/chain'

/**
 * Latest block number, polled lightly. Throughput lives in useNetworkStats, which counts
 * the real transactions in each block instead of estimating.
 */
export function useChainStats() {
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null)

  useEffect(() => {
    const client = createPublicClient({ transport: http(RPC_URL) })

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
  }, [])

  return { blockNumber }
}
