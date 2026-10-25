import { useEffect, useRef, useState } from 'react'
import { clientFor, withRetry } from '@/lib/arcRpc'
import { NETWORK } from '@/lib/chain'
import { BRIDGE_ADDRESSES, decodeBridgeLogs, type BridgeMove } from '@/lib/bridgeLive'
import { logRange } from '@/lib/orbitMap'

export const POLL_MS = 2500
export const MAX_BLOCKS_PER_TICK = 8

export interface LiveTx {
  hash: string
  to: string | null
  value: bigint
  input: string
}

export interface LiveBlock {
  /** Increases by one for every block this hook ever hands out, so a consumer can take each block once. */
  seq: number
  number: number
  timestamp: number
  txs: LiveTx[]
}

export interface LiveBlocksState {
  /** Only the blocks fetched by the latest tick. */
  blocks: LiveBlock[]
  latest: number | null
  seenBlocks: number
  seenTxs: number
  since: Date
  error: string | null
  /** Blocks that were never fetched because the page fell more than 8 behind. */
  skipped: number
  /** All bridge moves (CCTP, Gateway, Across, Hyperlane, LI.FI, deBridge) seen in the latest tick (empty when the log read failed). */
  moves: BridgeMove[]
}

const net = NETWORK.id === 5042 ? 'mainnet' : 'testnet'
const hex = (n: number) => `0x${n.toString(16)}` as const

/** Polls Arc for new blocks (with full transactions) while the page is visible. */
export function useLiveBlocks(): LiveBlocksState {
  const [since] = useState(() => new Date())
  const [state, setState] = useState<Omit<LiveBlocksState, 'since'>>({
    blocks: [],
    latest: null,
    seenBlocks: 0,
    seenTxs: 0,
    error: null,
    skipped: 0,
    moves: [],
  })

  // Mutable bookkeeping that must not trigger renders.
  const lastSeen = useRef<number | null>(null)
  const seq = useRef(0)
  const totals = useRef({ blocks: 0, txs: 0, skipped: 0 })

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    let running = false
    const client = clientFor(net)

    const schedule = () => {
      window.clearTimeout(timer)
      if (alive && !document.hidden) timer = window.setTimeout(() => { void tick() }, POLL_MS)
    }

    const tick = async () => {
      if (!alive || running || document.hidden) return
      running = true
      try {
        const head = Number(await withRetry(() => client.getBlockNumber()))
        if (!alive) return
        const prev = lastSeen.current

        let from: number
        let skippedNow = 0
        if (prev === null) {
          from = head
        } else {
          from = prev + 1
          if (head - from + 1 > MAX_BLOCKS_PER_TICK) {
            const resume = head - (MAX_BLOCKS_PER_TICK - 1)
            skippedNow = resume - from
            from = resume
          }
        }

        if (from > head) {
          setState(s => (s.latest === head && s.error === null ? s : { ...s, latest: head, error: null }))
          return
        }

        const numbers: number[] = []
        for (let n = from; n <= head; n++) numbers.push(n)
        const fetched = await Promise.all(
          numbers.map(n => withRetry(() => client.getBlock({ blockNumber: BigInt(n), includeTransactions: true }))),
        )
        if (!alive) return

        // Bridge log range covers EVERY block since the last seen one (up to 9000 back from head),
        // regardless of how many blocks the tx fetch was limited to. On the first tick use head only.
        const logR = logRange(prev, head)
        let moves: BridgeMove[] = []
        if (logR.from <= logR.to) {
          try {
            const logs = await withRetry(() => client.request({
              method: 'eth_getLogs',
              params: [{
                address: BRIDGE_ADDRESSES.map(a => a as `0x${string}`),
                fromBlock: hex(logR.from),
                toBlock: hex(logR.to),
              }],
            }))
            moves = decodeBridgeLogs(logs, net)
          } catch {
            moves = []
          }
        }
        if (!alive) return

        const blocks: LiveBlock[] = fetched.map(b => ({
          seq: ++seq.current,
          number: Number(b.number),
          timestamp: Number(b.timestamp),
          txs: b.transactions.map(t => ({ hash: t.hash, to: t.to ?? null, value: t.value, input: t.input })),
        }))
        lastSeen.current = head
        totals.current.skipped += skippedNow
        totals.current.blocks += blocks.length
        totals.current.txs += blocks.reduce((sum, b) => sum + b.txs.length, 0)

        setState({
          blocks,
          latest: head,
          seenBlocks: totals.current.blocks,
          seenTxs: totals.current.txs,
          error: null,
          skipped: totals.current.skipped,
          moves,
        })
      } catch (e) {
        if (alive) setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Could not read Arc blocks' }))
      } finally {
        running = false
        schedule()
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer)
      } else {
        void tick()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    void tick()

    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return { ...state, since }
}
