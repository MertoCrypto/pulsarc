import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { LiveBlocksState } from '@/hooks/useLiveBlocks'
import { domainName } from '@/lib/bridgeFlow'
import { DOMAIN_TO_CHAIN, type BridgeMove } from '@/lib/bridgeLive'
import { classifyTx, type AddressOwner } from '@/lib/liveTx'
import { BRIDGE_COLORS, type BridgeColorKey } from '@/lib/orbitMap'
import type { OrbitScene, SceneTx } from './orbitScene'

const PULSE_MS = 2000
const MAX_PULSES = 8

export interface Pulse { id: number; delay: number }

/**
 * Resolve a bridge move's counterpart chain to a display name for the pill.
 * Uses CCTP domain names for CCTP/Gateway moves, generic "chain <id>" for others.
 */
function moveName(move: BridgeMove): string {
  if (move.chainId === null) return 'Other networks'
  // For CCTP and Gateway, look up a friendly name by reverting chain id → CCTP domain
  if (move.bridge === 'cctp' || move.bridge === 'gateway') {
    // Find domain from chain id
    for (const [dom, cid] of Object.entries(DOMAIN_TO_CHAIN)) {
      if (cid === move.chainId) return domainName(Number(dom))
    }
  }
  // For all bridges, fall back to common chain names via CCTP domain lookup (chain ids overlap)
  for (const [dom, cid] of Object.entries(DOMAIN_TO_CHAIN)) {
    if (cid === move.chainId) return domainName(Number(dom))
  }
  // Robinhood Chain and Soneium
  if (move.chainId === 4663) return 'Robinhood Chain'
  if (move.chainId === 1868) return 'Soneium'
  return `Chain ${move.chainId}`
}

/**
 * Resolve a BridgeMove's chainId to the CCTP domain used by portKey, or null when
 * the chain is not a CCTP port (e.g. Robinhood 4663, Soneium 1868).
 */
function moveDomain(move: BridgeMove): number | null {
  if (move.chainId === null) return null
  for (const [dom, cid] of Object.entries(DOMAIN_TO_CHAIN)) {
    if (cid === move.chainId) return Number(dom)
  }
  // Non-CCTP chains: use chainId directly as domain for portKey lookup
  return move.chainId
}

/**
 * Takes each live block and each bridge move exactly once: feeds the canvas, keeps the counters for the
 * panels, and hands out one core pulse per new block.
 */
export function useOrbitFeed(
  live: LiveBlocksState,
  sceneRef: MutableRefObject<OrbitScene | null>,
  index: Map<string, AddressOwner>,
  pulsesOn: boolean,
) {
  const lastSeq = useRef(0)
  const lastMoves = useRef<BridgeMove[] | null>(null)
  const pulseId = useRef(0)
  const timers = useRef<number[]>([])
  const pulsesOnRef = useRef(pulsesOn)
  useEffect(() => { pulsesOnRef.current = pulsesOn }, [pulsesOn])
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({})
  const [seen, setSeen] = useState({ tracked: 0, total: 0 })
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
    if (live.moves === lastMoves.current) return
    lastMoves.current = live.moves
    if (live.moves.length === 0) return

    live.moves.forEach((m, i) => {
      const name = moveName(m)
      const domain = moveDomain(m) ?? -99
      const color = BRIDGE_COLORS[m.bridge] ?? BRIDGE_COLORS.cctp

      sceneRef.current?.addBridgeMove(
        {
          direction: m.direction,
          domain,
          usdc: m.usdc,
          name,
          bridge: m.bridge,
          color,
        },
        i,
        m.txHash,
      )
    })

  }, [live.moves, sceneRef])

  return { liveCounts, seen, pulses }
}
