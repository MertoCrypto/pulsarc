import { useMemo } from 'react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { TransitMap, TransitAccessibleTable } from '@/components/map/TransitMap'
import { layoutTransitMap } from '@/lib/transitMap'
import { ARC_APPS, CATEGORIES, type ArcApp, type AppCategory } from '@/data/apps'
import { PORTAL_APPS, type PortalApp } from '@/data/portal'
import { useAllMetrics, type RankedApp } from '@/hooks/useAllMetrics'
import { NETWORK } from '@/lib/chain'

export function MapPage() {
  const { items, isLoading, loaded, total } = useAllMetrics('24h', 'txCount', 'All')

  const layout = useMemo(() => {
    if (isLoading && items.length === 0) return null
    const trackedIds = new Set(ARC_APPS.map((a: ArcApp) => a.id.toLowerCase()))
    const portalStations = PORTAL_APPS
      .filter((p: PortalApp) => !trackedIds.has(p.key.toLowerCase()))
      .map((p: PortalApp) => ({ id: `portal:${p.key}`, name: p.name, line: 'Portal', tx: 0, wallets: 0, hollow: true }))

    const lineInputs = [
      ...CATEGORIES.map((cat: AppCategory) => ({
        key: cat as string,
        dashed: false,
        stations: ARC_APPS
          .filter((a: ArcApp) => a.category === cat)
          .map((a: ArcApp) => {
            const ranked: RankedApp | undefined = items.find((r: RankedApp) => r.app.id === a.id)
            return {
              id: a.id,
              name: a.name,
              line: cat as string,
              tx: ranked?.metrics.txCount ?? 0,
              wallets: ranked?.metrics.activeWallets ?? 0,
            }
          }),
      })),
      ...(portalStations.length > 0
        ? [{ key: 'Portal', dashed: true, stations: portalStations }]
        : []),
    ]
    return layoutTransitMap(lineInputs, { width: 1200, height: 680 })
  }, [items, isLoading])

  const stillLoading = loaded < total

  return (
    <div className="space-y-14">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">{`Map · ${NETWORK.name}`}</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[
              { text: 'The Arc' },
              { text: 'transit map.', className: 'text-[var(--periwinkle)]' },
            ]}
          />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Every tracked app on Arc as a station. Lines are categories, the busiest stations sit closest to the hub.
          </p>
        </section>
      </Reveal>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <section>
        {isLoading && items.length === 0 ? (
          <div className="arc-card animate-pulse" style={{ height: 'min(70vh, 640px)' }} />
        ) : (
          <TransitMap rankedApps={items} />
        )}

        {/* Loading progress note */}
        {stillLoading && (
          <p className="mt-3 text-sm text-[var(--faint)]">
            {`Loading apps (${loaded}/${total}) — map updates as data arrives.`}
          </p>
        )}

        {/* Footnote */}
        <p className="mt-3 max-w-[680px] text-sm leading-relaxed text-[var(--faint)]">
          Station size follows transactions in the last 24 hours. Wallet counts are lower bounds and may overlap between apps.
        </p>
      </section>

      {/* ── Accessible fallback ──────────────────────────────────────── */}
      {layout && (
        <section>
          <TransitAccessibleTable layout={layout} />
        </section>
      )}
    </div>
  )
}
