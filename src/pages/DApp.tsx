import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, ArrowUpRight, BarChart3, Layers, Receipt, Users } from 'lucide-react'
import { clsx } from 'clsx'
import { appById } from '@/data/apps'
import { CategoryBadge, VerifiedBadge, AppLogoBadge } from '@/components/shared/Badge'
import { FilterBar } from '@/components/shared/FilterBar'
import { Reveal } from '@/components/shared/Reveal'
import { StatCard } from '@/components/shared/StatCard'
import { MetricChart } from '@/components/dapp/MetricChart'
import { UpvoteButton } from '@/components/interact/UpvoteButton'
import { IUsedThisButton } from '@/components/interact/IUsedThisButton'
import { BoostButton } from '@/components/interact/BoostButton'
import { WatchlistButton } from '@/components/interact/WatchlistButton'
import { HealthScore, computeHealth } from '@/components/shared/HealthScore'
import { ShareButton } from '@/components/shared/ShareButton'
import { CommentsPanel } from '@/components/dapp/CommentsPanel'
import { useAppHistory } from '@/hooks/useAppHistory'
import { computeMetrics, describeSpan, RANGE_MS, type TimeRange } from '@/lib/appActivity'
import { HIGH_FREQUENCY, useWalletLevels } from '@/hooks/useWalletLevels'
import { compact, count, explorerAddress } from '@/lib/arcscan'

const TABS = ['Overview', 'Top wallets'] as const
type Tab = (typeof TABS)[number]

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const usd = (n: number) => `$${compact(n, n >= 1000 ? 2 : 2)}`

export function DApp() {
  const { id = '' } = useParams<{ id: string }>()
  const app = appById(id)

  const [tab, setTab] = useState<Tab>('Overview')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')

  const { history, metrics: rawMetrics, sample, isLoading, isError } = useAppHistory(id, timeRange)
  const [hideAutomated, setHideAutomated] = useState(false)

  const topWallets = useMemo(() => {
    if (!sample) return []
    const by = new Map<string, { n: number; usd: number }>()
    for (const a of sample.anchors) {
      for (const e of a.events) {
        for (const w of e.wallets) {
          const row = by.get(w) ?? { n: 0, usd: 0 }
          row.n++
          row.usd += e.usd ?? 0
          by.set(w, row)
        }
      }
    }
    return [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15)
  }, [sample])

  const { levels, flagged } = useWalletLevels(topWallets.map(([a]) => a))
  const metrics = useMemo(
    () => (sample && hideAutomated ? computeMetrics(sample, RANGE_MS[timeRange], Date.now(), flagged) : rawMetrics),
    [sample, hideAutomated, flagged, timeRange, rawMetrics],
  )
  const health = useMemo(
    () => (metrics ? computeHealth(metrics, history.total) : null),
    [metrics, history.total],
  )

  const sampled = sample ? sample.anchors.reduce((s, a) => s + a.events.length, 0) : 0

  if (!app) {
    return (
      <div className="flex flex-col items-center gap-4 py-32 text-center">
        <p className="text-xl font-light text-white">We do not track that app.</p>
        <Link to="/" className="arc-btn-ghost">Back to rankings</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--muted)] transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Rankings
      </Link>

      <Reveal>
        <section className="arc-card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <AppLogoBadge initials={app.logoInitials} color={app.logoColor} logo={app.logo} logoIcon={app.logoIcon} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <h1 className="text-[28px] font-light leading-tight tracking-tight text-white">{app.name}</h1>
                <CategoryBadge category={app.category} size="md" />
                {app.verified && <VerifiedBadge size="md" />}
              </div>
              <p className="mt-2 max-w-[640px] text-[var(--muted)]">{app.description}</p>

              {health && (
                <div className="mt-6">
                  <HealthScore health={health} />
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2" onClick={e => { e.stopPropagation() }}>
                <UpvoteButton dappId={app.id} />
                <IUsedThisButton dappId={app.id} />
                <WatchlistButton dappId={app.id} />
                <BoostButton dappId={app.id} dappName={app.name} />
                <ShareButton title={app.name} description={app.description} url={`${window.location.origin}/dapp/${app.id}`} />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {app.anchors.map(a => (
                  <a key={a.address} href={explorerAddress(a.address)} target="_blank" rel="noreferrer"
                    className="arc-panel inline-flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:text-white">
                    <span>{a.label}</span>
                    <span className="font-['Geist_Mono'] text-[11px] text-[var(--faint)]">{short(a.address)}</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex gap-1 border-b border-[var(--line)]">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  '-mb-px border-b px-4 py-2.5 text-sm transition-colors',
                  tab === t ? 'border-[var(--periwinkle)] text-white' : 'border-transparent text-[var(--muted)] hover:text-white',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      </Reveal>

      {isError && (
        <p className="arc-panel px-4 py-3 text-sm text-[var(--muted)]">ArcScan did not answer. It will try again on its own.</p>
      )}

      {tab === 'Overview' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <FilterBar timeRange={timeRange} onTimeRangeChange={v => setTimeRange(v as TimeRange)} ranges={['1h', '24h']} category="All" onCategoryChange={() => {}} hideCategories />
            <button className="arc-chip" data-active={hideAutomated} onClick={() => setHideAutomated(v => !v)}
              title={`Leaves out the app's busiest wallets that have ${HIGH_FREQUENCY.toLocaleString()}+ lifetime transactions`}>
              {hideAutomated ? 'Excluding automated wallets' : 'Exclude automated wallets'}
              {flagged.size > 0 && <span className="ml-2 font-['Geist_Mono'] text-[11px] opacity-60">{flagged.size}</span>}
            </button>
          </div>

          <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Transactions" value={metrics?.txCount ?? 0} format={n => `${metrics?.estimated ? '≈' : ''}${count(n)}`}
              subValue={metrics?.estimated ? 'extrapolated from newest activity' : 'exact count'} icon={ArrowLeftRight} isLoading={isLoading} />
            <StatCard label="Wallets" value={metrics?.activeWallets ?? 0} format={n => `${metrics?.estimated ? '≥' : ''}${Math.round(n)}`}
              subValue="distinct addresses" icon={Users} isLoading={isLoading} />
            <StatCard label="Dollars moved" value={metrics?.volume ?? 0} format={n => (metrics?.volume == null ? '—' : usd(n))}
              subValue={metrics?.volume == null ? 'no USDC-denominated flow' : 'USDC-denominated'} icon={BarChart3} isLoading={isLoading} />
            <StatCard label="USDC held" value={metrics?.tvl ?? 0} format={n => (metrics?.tvl == null ? '—' : usd(n))}
              subValue="by the app's contracts" icon={Layers} isLoading={isLoading} />
          </Reveal>

          {!isLoading && !history.complete && (
            <p className="arc-panel px-4 py-3 text-sm leading-relaxed text-[var(--muted)]">
              This app is busier than ArcScan lets us read in one go, so the charts show its latest {describeSpan(history.coveredMs)} ({sampled.toLocaleString()} events) in detail, and the totals above are scaled up from that rate.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricChart title="Transactions" data={history.perApp[app.id] ?? []} dataKey="txCount" isLoading={isLoading} />
            <MetricChart title="Active wallets" data={history.perApp[app.id] ?? []} dataKey="activeWallets" isLoading={isLoading} />
            <MetricChart title="Dollars moved" data={history.perApp[app.id] ?? []} dataKey="volume" formatter={v => usd(v)} isLoading={isLoading} empty="This app has no USDC-denominated flow." />
            <MetricChart title="Gas fees paid" data={history.perApp[app.id] ?? []} dataKey="usdcFees" formatter={v => `$${v.toFixed(4)}`} isLoading={isLoading} empty="Fees are only measured for contracts that receive transactions." />
          </div>
        </>
      )}

      {tab === 'Top wallets' && (
        <Reveal>
          <div className="arc-card overflow-hidden">
            {isLoading ? (
              <div className="space-y-3 p-6">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded bg-white/6" />)}</div>
            ) : topWallets.length === 0 ? (
              <p className="px-6 py-14 text-center text-[var(--muted)]">No wallet activity found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      {['#', 'Wallet', 'Lifetime txs', 'Events', 'Dollars moved'].map((h, i) => (
                        <th key={h} className={`arc-eyebrow !text-[10px] px-5 py-3.5 font-normal ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topWallets.map(([addr, row], i) => (
                      <tr key={addr} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                        <td className="w-12 px-5 py-3.5 text-sm tabular-nums text-[var(--faint)]">{i + 1}</td>
                        <td className="px-5 py-3.5">
                          <Link to={`/wallet/${addr}`} className="font-['Geist_Mono'] text-sm text-white hover:text-[var(--periwinkle)]">{short(addr)}</Link>
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">
                          {levels.has(addr) ? levels.get(addr)!.toLocaleString() : '…'}
                          {flagged.has(addr) && <span className="ml-2 rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-[10px] uppercase tracking-wider">automated</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">{row.n}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{row.usd > 0 ? usd(row.usd) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--faint)]">
            <Receipt className="h-3.5 w-3.5" />
            Ranked within the {sampled.toLocaleString()} newest events we read — not all-time. "Automated" means {HIGH_FREQUENCY.toLocaleString()}+ lifetime transactions: a heuristic, not proof.
          </p>
        </Reveal>
      )}

      <CommentsPanel dappId={app.id} />
    </div>
  )
}
