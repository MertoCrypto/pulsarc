/**
 * useBridgeHour — snapshot of all bridge moves in the last hour on Arc, refreshed every 60 s.
 * Reads the last hour of blocks, fetches one combined eth_getLogs, decodes via bridgeLive.ts.
 */
import { useEffect, useRef, useState } from 'react'
import { clientFor } from '@/lib/arcRpc'
import { NETWORK } from '@/lib/chain'
import {
  BRIDGE_ADDRESSES,
  decodeBridgeLogs,
  summarise,
  type BridgeMove,
  type BridgeSummary,
} from '@/lib/bridgeLive'

export const BRIDGE_HOUR_POLL_MS = 60_000
const HOUR_SECONDS = 3600

export interface BridgeHourState {
  moves: readonly BridgeMove[]
  summary: BridgeSummary
  /** Null until first successful load. */
  fromBlock: number | null
  toBlock: number | null
  loading: boolean
  error: string | null
  /** ISO string of last successful fetch. */
  lastUpdated: string | null
}

const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'
const hex = (n: number) => `0x${n.toString(16)}` as const

const EMPTY_SUMMARY = summarise([])

const INITIAL: BridgeHourState = {
  moves: [],
  summary: EMPTY_SUMMARY,
  fromBlock: null,
  toBlock: null,
  loading: true,
  error: null,
  lastUpdated: null,
}

/**
 * Estimate how many blocks cover the last `hours`. Arc block time is dynamic,
 * so we sample a span of recent blocks to measure it.
 */
async function estimateBlocksForHours(hours: number): Promise<{ from: number; to: number }> {
  const client = clientFor(net)
  const head = Number(await client.getBlockNumber())
  // Sample 1000 blocks ago to measure block time
  const SAMPLE = 1000n
  const sampleBlock = BigInt(head) > SAMPLE ? BigInt(head) - SAMPLE : 0n
  const [latest, earlier] = await Promise.all([
    client.getBlock({ blockNumber: BigInt(head), includeTransactions: false }),
    client.getBlock({ blockNumber: sampleBlock, includeTransactions: false }),
  ])
  const elapsedSec = Number(latest.timestamp - earlier.timestamp)
  const sampledBlocks = Number(BigInt(head) - sampleBlock)
  const secPerBlock = sampledBlocks > 0 && elapsedSec > 0 ? elapsedSec / sampledBlocks : 0.5
  const blocksNeeded = Math.ceil((hours * HOUR_SECONDS) / secPerBlock)
  const from = Math.max(0, head - Math.min(blocksNeeded, 8999))
  return { from, to: head }
}

export function useBridgeHour(): BridgeHourState {
  const [state, setState] = useState<BridgeHourState>(INITIAL)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let alive = true
    let running = false

    const load = async () => {
      if (!alive || running) return
      running = true
      try {
        const { from, to } = await estimateBlocksForHours(1)
        if (!alive) return

        const client = clientFor(net)
        const rawLogs = await (client.request as (req: {
          method: string
          params: unknown[]
        }) => Promise<unknown[]>)({
          method: 'eth_getLogs',
          params: [{
            address: BRIDGE_ADDRESSES.map(a => a as `0x${string}`),
            fromBlock: hex(from),
            toBlock: hex(to),
          }],
        })
        if (!alive) return

        const logs = (rawLogs as Array<{
          address: string
          topics: string[]
          data: string
          transactionHash: string | null
        }>).map(l => ({
          address: l.address,
          topics: l.topics as readonly string[],
          data: l.data,
          transactionHash: l.transactionHash,
        }))

        const moves = decodeBridgeLogs(logs, net)
        const summary = summarise(moves)
        setState({
          moves,
          summary,
          fromBlock: from,
          toBlock: to,
          loading: false,
          error: null,
          lastUpdated: new Date().toISOString(),
        })
      } catch (e) {
        if (alive) setState(s => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : 'Could not fetch bridge logs',
        }))
      } finally {
        running = false
        if (alive) {
          timer.current = window.setTimeout(load, BRIDGE_HOUR_POLL_MS)
        }
      }
    }

    void load()

    return () => {
      alive = false
      window.clearTimeout(timer.current)
    }
  }, [])

  return state
}
