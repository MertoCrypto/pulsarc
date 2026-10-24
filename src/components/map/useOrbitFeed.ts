import { useEffect, useReducer, useRef, useState, type MutableRefObject } from 'react'
import type { LiveBlocksState } from '@/hooks/useLiveBlocks'
import { domainName } from '@/lib/bridgeFlow'
import { EMPTY_CCTP_STATS, addMoves, type CctpMove } from '@/lib/cctpLive'
import { classifyTx, type AddressOwner } from '@/lib/liveTx'
import type { OrbitScene, SceneTx } from './orbitScene'

const PULSE_MS = 2000
const MAX_PULSES = 8

export interface Pulse { id: number; delay: number }

/**
 * Takes each live block and each CCTP move exactly once: feeds the canvas, keeps the counters for the
 * panels, and hands out one core pulse per new block.
 */
export function useOrbitFeed(
  live: LiveBlocksState,
  sceneRef: MutableRefObject<OrbitScene | null>,
  index: Map<string, AddressOwner>,
  pulsesOn: boolean,
) {
  const lastSeq = useRef(0)
  const lastCctp = useRef<CctpMove[] | null>(null)
  const pulseId = useRef(0)
  const timers = useRef<number[]>([])
  const pulsesOnRef = useRef(pulsesOn)
  useEffect(() => { pulsesOnRef.current = pulsesOn }, [pulsesOn])
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({})
  const [seen, setSeen] = useState({ tracked: 0, total: 0 })
  const [stats, addStats] = useReducer(addMoves, EMPTY_CCTP_STATS)
  const [pulses, setPulses] = useState<Pulse[]>([])

  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)) }, [])

  useEffect(() => {
    const fresh = live.blocks.filter(b => b.seq > lastSeq.current)
    if (fresh.length === 0) return
    lastSeq.current = fresh[fresh.length - 1].seq
    const add: Record<string, number> = {}
    let tracked = 0
    let total = 0
    for (const block of fresh) {
      const classified: SceneTx[] = block.txs.map(tx => classifyTx(tx, index))
      for (const c of classified) {
        total++
        if (c.appId) { tracked++; add[c.appId] = (add[c.appId] ?? 0) + 1 }
      }
      sceneRef.current?.addBlock(block.number, classified)
    }
    setSeen(s => ({ tracked: s.tracked + tracked, total: s.total + total }))
    setLiveCounts(prev => {
      const next = { ...prev }
      for (const [id, n] of Object.entries(add)) next[id] = (next[id] ?? 0) + n
      return next
    })

    // one extra ring on the core per new block, staggered when several arrive together
    if (!pulsesOnRef.current) return
    const made: Pulse[] = fresh.slice(-4).map((_, i) => ({ id: ++pulseId.current, delay: i * 0.22 }))
    setPulses(p => [...p, ...made].slice(-MAX_PULSES))
    const ids = new Set(made.map(m => m.id))
    timers.current.push(window.setTimeout(() => setPulses(p => p.filter(x => !ids.has(x.id))), PULSE_MS + made.length * 220))
  }, [live.blocks, index, sceneRef])

  useEffect(() => {
    if (live.cctp === lastCctp.current) return
    lastCctp.current = live.cctp
    if (live.cctp.length === 0) return
    live.cctp.forEach((m, i) => {
      sceneRef.current?.addCctp(
        { direction: m.direction, domain: m.domain, usdc: m.usdc, name: m.domain === -1 ? 'Unknown source' : domainName(m.domain) },
        i,
        m.txHash,
      )
    })
    addStats(live.cctp)
  }, [live.cctp, sceneRef])

  return { liveCounts, seen, stats, pulses }
}
