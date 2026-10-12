/** Pure network statistics from a sample of blocks and the fee history (no RPC here). */

export interface BlockSample {
  number: number
  txCount: number
  gasUsedRatio: number
  baseFeeGwei: number
}

export interface SampledBlock {
  number: bigint
  timestamp: bigint
  transactions: readonly unknown[]
}

export interface FeeHistoryLike {
  gasUsedRatio: readonly number[]
  baseFeePerGas: readonly bigint[]
}

/** Arc's fee floor is 20 Gwei (docs.arc.io / stable-fee-design). */
export const FEE_FLOOR_GWEI = 20
export const TRANSFER_GAS = 21_000

export interface ComputedStats {
  blocks: BlockSample[]
  latestBlock: number
  tps: number | null
  peakTps: number | null
  avgBlockTimeSec: number | null
  baseFeeGwei: number
  /** USDC cost of a plain 21,000-gas transfer at the current base fee. */
  transferCostUsdc: number
  /** Share of sampled blocks whose base fee sat exactly at the minimum. */
  atFloorShare: number
  avgFullness: number
}

export function computeNetworkStats(blocks: readonly SampledBlock[], history: FeeHistoryLike, latest: bigint): ComputedStats {
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

  return {
    blocks: samples,
    latestBlock: Number(latest),
    tps: span > 0 ? totalTx / span : null,
    peakTps: peak || null,
    avgBlockTimeSec: span > 0 ? span / (blocks.length - 1) : null,
    baseFeeGwei: Number(baseFeeWei) / 1e9,
    transferCostUsdc: cost,
    atFloorShare: samples.filter(b => b.baseFeeGwei <= FEE_FLOOR_GWEI + 0.001).length / samples.length,
    avgFullness: samples.reduce((s, b) => s + b.gasUsedRatio, 0) / samples.length,
  }
}
