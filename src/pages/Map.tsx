import { useRef, useEffect, useReducer } from 'react'
import { useAllMetrics } from '@/hooks/useAllMetrics'
import { useLiveBlocks, type LiveBlocksState } from '@/hooks/useLiveBlocks'
import { useChainSizes } from '@/hooks/useLlama'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { NETWORK } from '@/lib/chain'
import { EMPTY_CCTP_STATS, addMoves, type CctpStats, type CctpMove } from '@/lib/cctpLive'
import type { BridgeId } from '@/lib/bridgeLive'
import { EMPTY_BRIDGE_TALLY, type BridgeTally } from '@/components/map/OrbitHud'
import { OrbitMap } from '@/components/map/OrbitMap'
import { CapitalSection } from '@/components/map/CapitalSection'



export function MapPage() {
  const { items, loaded, total } = useAllMetrics('24h', 'txCount', 'All')
  const stillLoading = loaded < total
  const { data: chainSizesData } = useChainSizes()
  const chainSizesLive = chainSizesData?.live ?? false

  // Single useLiveBlocks call — shared by OrbitMap and CapitalSection.
  const live = useLiveBlocks()

  // Session CCTP stats accumulated from live.moves (CCTP-only subset).
  const [stats, addStats] = useReducer(
    (s: CctpStats, moves: readonly CctpMove[]) => addMoves(s, moves),
    EMPTY_CCTP_STATS,
  )

  // Per-bridge tally accumulated from ALL bridges in live.moves.
  const [bridgeTally, addBridgeTally] = useReducer(
    (s: BridgeTally, moves: { bridge: BridgeId; direction: 'in' | 'out'; usdc: number | null }[]) => {
      if (moves.length === 0) return s
      const next = { ...s }
      for (const m of moves) {
        const prev = next[m.bridge] ?? { inCount: 0, outCount: 0, usdc: 0 }
        next[m.bridge] = {
          inCount:  prev.inCount  + (m.direction === 'in'  ? 1 : 0),
          outCount: prev.outCount + (m.direction === 'out' ? 1 : 0),
          usdc:     prev.usdc     + (m.usdc ?? 0),
        }
      }
      return next
    },
    EMPTY_BRIDGE_TALLY,
  )

  const lastMoves = useRef(live.moves)

  useEffect(() => {
    if (live.moves === lastMoves.current) return
    lastMoves.current = live.moves
    if (live.moves.length === 0) return
    // toCctpMove is defined inside useOrbitFeed; re-implement the CCTP filter inline.
    const cctpMoves: CctpMove[] = live.moves
      .filter(m => m.bridge === 'cctp')
      .map(m => ({ txHash: m.txHash, direction: m.direction, domain: -1, usdc: m.usdc }))
    if (cctpMoves.length > 0) addStats(cctpMoves)
    // Accumulate all bridges.
    addBridgeTally(
      live.moves.map(m => ({ bridge: m.bridge, direction: m.direction, usdc: m.usdc }))
    )
  }, [live.moves])

  return (
    <div className="space-y-0">
      {/* Page title — in the normal container, above the stage */}
      <Reveal>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="arc-eyebrow">{`Map · ${NETWORK.name}`}</p>
          </div>
        </div>
        <SplitLines
          as="h1"
          delay={0.1}
          className="arc-display text-[clamp(32px,4vw,56px)] text-white"
          lines={[{ text: 'Arc, live in orbit.' }]}
        />
        <p className="mt-3 max-w-[480px] text-[14px] font-light leading-relaxed text-[var(--muted)]">
          Every block pulses from the core. Transactions fly to the apps they touch, and USDC crosses in from other networks through CCTP.
        </p>
      </Reveal>

      {/* The galaxy stage — full viewport width, nothing beside it */}
      <OrbitMap
        items={items}
        live={live}
        stats={stats}
        bridgeTally={bridgeTally}
        footer={
          <>
            {stillLoading && (
              <p className="mt-3 text-sm text-[var(--faint)]">
                {`Loading apps (${loaded}/${total}) — map updates as data arrives.`}
              </p>
            )}
            <p className="mt-3 max-w-[680px] text-sm leading-relaxed text-[var(--faint)]">
              Comets are transactions in Arc blocks as they arrive, read directly from the Arc RPC. Planet size follows transactions in the last 24 hours. Amounts are shown only when a transaction moves USDC. Cross-chain moves are read from Arc logs: CCTP (Circle's Bridge Kit settles through CCTP), Circle Gateway, Across, Hyperlane warp routes, LI.FI, deBridge, Relay departures and Rhino.fi. Transfers started from Arc Portal cannot be told apart. LayerZero and Wormhole are not included yet.
            </p>
          </>
        }
      />

      {/* Capital & flows section */}
      <div className="mt-16 space-y-6">
        <CapitalSection stats={stats} chainSizesLive={chainSizesLive} />
      </div>
    </div>
  )
}

/** Re-exported for any consumer that needs the live state type without importing the hook. */
export type { LiveBlocksState }
