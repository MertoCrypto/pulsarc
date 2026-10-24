import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { OrbitMap } from '@/components/map/OrbitMap'
import { useAllMetrics } from '@/hooks/useAllMetrics'
import { NETWORK } from '@/lib/chain'

export function MapPage() {
  const { items, loaded, total } = useAllMetrics('24h', 'txCount', 'All')

  const stillLoading = loaded < total

  return (
    <div className="space-y-10">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">{`Map · ${NETWORK.name}`}</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(32px,5vw,64px)] text-white"
            lines={[{ text: 'Arc, live in orbit.' }]}
          />
        </section>
      </Reveal>

      {/* ── Orbit ───────────────────────────────────────────────────── */}
      <section>
        <OrbitMap items={items} />

        {/* Loading progress note */}
        {stillLoading && (
          <p className="mt-3 text-sm text-[var(--faint)]">
            {`Loading apps (${loaded}/${total}) — map updates as data arrives.`}
          </p>
        )}

        {/* Footnote */}
        <p className="mt-3 max-w-[680px] text-sm leading-relaxed text-[var(--faint)]">
          Comets are transactions in Arc blocks as they arrive, read directly from the Arc RPC. Planet size follows transactions in the last 24 hours. Amounts are shown only when a transaction moves USDC.
        </p>
      </section>
    </div>
  )
}
