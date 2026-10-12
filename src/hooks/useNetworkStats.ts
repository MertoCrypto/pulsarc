import { useEffect, useState } from 'react'
import { clientFor, inGroups, withRetry } from '@/lib/arcRpc'
import { computeNetworkStats, type BlockSample } from '@/lib/networkStats'

const SAMPLE_BLOCKS = 30
const REFRESH_MS = 30_000
const RETRY_MS = 6_000

export type { BlockSample } from '@/lib/networkStats'

export interface NetworkStats {
  blocks: BlockSample[]
  latestBlock: number | null
  tps: number | null
  peakTps: number | null
  avgBlockTimeSec: number | null
  baseFeeGwei: number | null
  /** USDC cost of a plain 21,000-gas transfer at the current base fee. */
  transferCostUsdc: number | null
  /** Share of sampled blocks whose base fee sat exactly at the minimum. */
  atFloorShare: number | null
  avgFullness: number | null
  isLoading: boolean
  error: string | null
}

const EMPTY: NetworkStats = {
  blocks: [], latestBlock: null, tps: null, peakTps: null, avgBlockTimeSec: null,
  baseFeeGwei: null, transferCostUsdc: null, atFloorShare: null, avgFullness: null,
  isLoading: true, error: null,
}

export function useNetworkStats(net: 'testnet' | 'mainnet' = 'testnet'): NetworkStats {
  const [stats, setStats] = useState<NetworkStats>(EMPTY)

  useEffect(() => {
    const client = clientFor(net)
    let cancelled = false
    setStats(EMPTY)

    async function load() {
      try {
        const latest = await withRetry(() => client.getBlockNumber())
        const first = latest - BigInt(SAMPLE_BLOCKS - 1)

        const history = await withRetry(() =>
          client.getFeeHistory({ blockCount: SAMPLE_BLOCKS, blockTag: 'latest', rewardPercentiles: [] }))
        // Groups of 10 with a short pause keep the burst under Arc's rate limit.
        const blocks = await inGroups(
          Array.from({ length: SAMPLE_BLOCKS }, (_, i) => first + BigInt(i)),
          10, 350,
          n => client.getBlock({ blockNumber: n, includeTransactions: false }),
        )
        if (cancelled) return

        const c = computeNetworkStats(blocks, history, latest)

        setStats({ ...c, isLoading: false, error: null })
      } catch (e) {
        if (cancelled) return
        // Keep showing the loading state until we have real numbers; surface the cause and retry soon.
        setStats(prev => ({ ...prev, isLoading: prev.blocks.length === 0, error: e instanceof Error ? e.message : 'RPC error' }))
        retry = window.setTimeout(() => { void load() }, RETRY_MS)
      }
    }

    let retry = 0
    void load()
    const id = setInterval(() => { void load() }, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id); window.clearTimeout(retry) }
  }, [net])

  return stats
}
