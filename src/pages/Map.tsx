import { useRef, useEffect, useReducer } from 'react'
import { useAllMetrics } from '@/hooks/useAllMetrics'
import { useLiveBlocks } from '@/hooks/useLiveBlocks'
import { useChainSizes } from '@/hooks/useLlama'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { NETWORK } from '@/lib/chain'
import { EMPTY_CCTP_STATS, addMoves, type CctpMove } from '@/lib/cctpLive'
import { OrbitMap } from '@/components/map/OrbitMap'
import { CapitalSection } from '@/components/map/CapitalSection'



export function MapPage() {
  const { items, loaded, total } = useAllMetrics('24h', 'txCount', 'All')
  const stillLoading = loaded < total
  const { data: chainSizesData } = useChainSizes()
  const chainSizesLive = chainSizesData?.live ?? false

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
        footer={
          <>
            {stillLoading && (
              <p className="mt-3 text-sm text-[var(--faint)]">
                {`Loading apps (${loaded}/${total}) — map updates as data arrives.`}
              </p>
            )}
            <p className="mt-3 max-w-[680px] text-sm leading-relaxed text-[var(--faint)]">
              Comets are transactions in Arc blocks as they arrive, read directly from the Arc RPC. Planet size follows transactions in the last 24 hours. Amounts are shown only when a transaction moves USDC. Cross-chain moves are CCTP v2 burns and mints read from Arc logs; other bridges are not shown yet.
            </p>
          </>
        }
      />

      {/* Capital & flows section */}
      <div className="mt-16 space-y-6">
        <CapitalSectionWrapper chainSizesLive={chainSizesLive} />
      </div>
    </div>
  )
}

/**
 * Wrapper to get the live CCTP stats from the shared useLiveBlocks state that
 * OrbitMap already has. We re-use the same hook — React's hook deduplication
 * means there is only one subscription, so no duplicate RPC calls.
 */
function CapitalSectionWrapper({ chainSizesLive }: { chainSizesLive: boolean }) {
  const live = useLiveBlocks()
  const [stats, addStats] = useReducer(
    (s: typeof EMPTY_CCTP_STATS, moves: readonly CctpMove[]) => addMoves(s, moves),
    EMPTY_CCTP_STATS,
  )
  const lastCctp = useRef(live.cctp)

  useEffect(() => {
    if (live.cctp === lastCctp.current) return
    lastCctp.current = live.cctp
    if (live.cctp.length > 0) addStats(live.cctp)
  }, [live.cctp])

  return <CapitalSection stats={stats} chainSizesLive={chainSizesLive} />
}
