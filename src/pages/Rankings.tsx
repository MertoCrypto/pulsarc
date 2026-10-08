import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Users, ArrowLeftRight, Layers, ArrowRight } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { FilterBar } from '@/components/shared/FilterBar'
import { ArcField } from '@/components/layout/ArcField'
import { Ticker } from '@/components/layout/Ticker'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { gsap, ScrollTrigger } from '@/lib/smoothScroll'
import { LiveBadge } from '@/components/layout/LiveBadge'
import { LeaderboardTable } from '@/components/rankings/LeaderboardTable'
import { useAllMetrics, type SortKey } from '@/hooks/useAllMetrics'
import { type TimeRange } from '@/hooks/useAppMetrics'

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toString()
}

export function Rankings() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [category, setCategory] = useState('All')
  const [sortKey, setSortKey] = useState<SortKey>('txCount')

  const { items, isLoading, loaded, total, lastUpdated, totals, refresh } = useAllMetrics(timeRange, sortKey, category)
  const reading = loaded < total
  const windowLabel = timeRange === '1h' ? 'last hour' : 'last 24 hours'

  const heroRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)

  // Scroll-scrubbed exit: the copy drifts up, shrinks and fades as the field takes over.
  useEffect(() => {
    if (!heroRef.current || !copyRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.to(copyRef.current, {
        yPercent: -22, scale: 0.93, opacity: 0, filter: 'blur(6px)', ease: 'none',
        scrollTrigger: { trigger: heroRef.current, start: 'top top+=68', end: 'bottom top+=120', scrub: 0.6 },
      })
    }, heroRef)
    return () => { ctx.revert(); ScrollTrigger.refresh() }
  }, [])

  return (
    <div className="space-y-8">
      {/* Hero — breaks out of the container so the field spans the viewport */}
      <section ref={heroRef} className="relative -mx-6 flex min-h-[clamp(440px,62vh,660px)] items-center overflow-hidden xl:-mr-[17rem]">
        <ArcField className="absolute inset-0" />
        {/* Readability veil under the copy */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,24,44,0.88)_0%,rgba(11,24,44,0.7)_45%,rgba(11,24,44,0.42)_100%)] lg:bg-[linear-gradient(100deg,#0b182c_8%,rgba(11,24,44,0.86)_34%,rgba(11,24,44,0.1)_62%,transparent_78%)]" />

        <div ref={copyRef} className="relative max-w-[780px] px-6 py-16 will-change-transform">
          <Reveal>
            <p className="arc-eyebrow mb-6">Pulsarc · Arc Testnet</p>
          </Reveal>
          <SplitLines
            as="h1"
            delay={0.1}
            className="arc-display text-[clamp(36px,5vw,70px)] text-white"
            lines={[{ text: 'The pulse of Arc,' }, { text: 'measured on-chain.', className: 'text-[var(--periwinkle)]' }]}
          />
          <Reveal delay={0.16}>
            <p className="mt-6 max-w-[560px] text-[19px] font-light leading-relaxed text-[var(--muted)]">
              Live rankings of the apps building on Arc, scored on verified activity: transactions, wallets and USDC moved. Every figure is read from the chain and traces back to a real contract.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#rankings" className="arc-btn group">
                Explore rankings
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </a>
              <Link to="/compare" className="arc-btn-ghost">Compare apps</Link>
            </div>
          </Reveal>
          <Reveal delay={0.32}>
            <p className="mt-6 max-w-[440px] text-[13px] leading-relaxed text-[var(--faint)]">
              <span className="text-[var(--muted)]">Pulsar + Arc.</span> A pulsar is a star that beats with perfect regularity. Pulsarc reads the same steady beat from the Arc network, block by block.
            </p>
          </Reveal>
        </div>
      </section>

      <Ticker items={items} />

      {/* Stats row */}
      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Transactions"
          value={totals.txCount}
          format={fmtNum}
          subValue={`across tracked apps, ${windowLabel}`}
          icon={ArrowLeftRight}
          isLoading={isLoading}
        />
        <StatCard
          label="Active wallets"
          value={totals.activeWallets}
          format={fmtNum}
          subValue="seen in the sampled activity"
          icon={Users}
          isLoading={isLoading}
        />
        <StatCard
          label="Dollars moved"
          value={totals.volume}
          format={fmtUSD}
          subValue="USDC-denominated transfers"
          icon={BarChart3}
          isLoading={isLoading}
        />
        <StatCard
          label="USDC held"
          value={totals.tvl}
          format={fmtUSD}
          subValue="by app contracts"
          icon={Layers}
          isLoading={isLoading}
        />
      </Reveal>

      {/* Table card */}
      <Reveal>
      <div id="rankings" className="arc-card overflow-hidden scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-[var(--line)]">
          <FilterBar
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            category={category}
            onCategoryChange={setCategory}
          />
          <LiveBadge lastUpdated={lastUpdated} onRefresh={() => { void refresh() }} isLoading={reading} progress={reading ? `Reading apps ${loaded}/${total}…` : undefined} />
        </div>

        <LeaderboardTable
          items={items}
          isLoading={isLoading}
          sortKey={sortKey}
          onSortChange={setSortKey}
        />
        <p className="border-t border-[var(--line)] px-6 py-4 text-sm leading-relaxed text-[var(--faint)]">
          Each app is measured through its real contracts (token transfers for pools, vaults and stablecoins; transactions for infrastructure). Very busy apps are sampled from their newest activity, so their counts are extrapolated — marked ≈, and wallets as ≥. "Dollars moved" only includes USDC-denominated transfers. Rank arrows show change since this browser last saw the ranking.
        </p>
      </div>
      </Reveal>
    </div>
  )
}
