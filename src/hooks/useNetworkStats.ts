import { useEffect, useState } from 'react'
import { clientFor, inGroups, withRetry } from '@/lib/arcRpc'

const SAMPLE_BLOCKS = 30
const REFRESH_MS = 30_000
const RETRY_MS = 6_000

export interface BlockSample {
  number: number
  txCount: number
  gasUsedRatio: number
  baseFeeGwei: number
}

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

/** Arc's fee floor is 20 Gwei (docs.arc.io / stable-fee-design). */
const FEE_FLOOR_GWEI = 20
const TRANSFER_GAS = 21_000

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

        const samples: BlockSample[] = blocks.map((b, i) => ({
          number: Number(b.number),
          txCount: b.transactions.length,
          gasUsedRatio: history.gasUsedRatio[i] ?? 0,
          baseFeeGwei: Number(history.baseFeePerGas[i] ?? 0n) / 1e9,
        }))

        const span = Number(blocks[blocks.length - 1].timestamp - blocks[0].timestamp)
        const totalTx = samples.reduce((s, b) => s + b.txCount, 0)

        // Peak: busiest 5-block window, so one stray block can't set the record.
        let peak = 0
        for (let i = 0; i + 5 <= blocks.length; i++) {
          const dt = Number(blocks[i + 4].timestamp - blocks[i].timestamp)
          const tx = samples.slice(i, i + 5).reduce((s, b) => s + b.txCount, 0)
          if (dt > 0) peak = Math.max(peak, tx / dt)
        }

        const baseFeeWei = history.baseFeePerGas[history.baseFeePerGas.length - 1] ?? 0n
        const cost = Number(baseFeeWei * BigInt(TRANSFER_GAS)) / 1e18 // gas token has 18 decimals

        setStats({
          blocks: samples,
          latestBlock: Number(latest),
          tps: span > 0 ? totalTx / span : null,
          peakTps: peak || null,
          avgBlockTimeSec: span > 0 ? span / (blocks.length - 1) : null,
          baseFeeGwei: Number(baseFeeWei) / 1e9,
          transferCostUsdc: cost,
          atFloorShare: samples.filter(b => b.baseFeeGwei <= FEE_FLOOR_GWEI + 0.001).length / samples.length,
          avgFullness: samples.reduce((s, b) => s + b.gasUsedRatio, 0) / samples.length,
          isLoading: false,
          error: null,
        })
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
