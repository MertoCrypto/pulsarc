import { useState, useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { MainnetPending } from '@/components/shared/MainnetPending'
import { NETWORK } from '@/lib/chain'
import { compact } from '@/lib/arcscan'
import { useChainTvl, useFees, useDexs, useStablecoins } from '@/hooks/useLlama'
import {
  latestAndChange,
  lastFullDay,
  topProtocols,
  launchpads,
  venueShares,
  headlineMismatch,
  type SeriesPoint,
} from '@/lib/llama'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtUsd(n: number): string {
  return '$' + compact(n)
}

function fmtChange(change: number | null): { text: string; positive: boolean } | null {
  if (change === null) return null
  const pct = (change * 100).toFixed(1)
  return { text: (change >= 0 ? '+' : '') + pct + '%', positive: change >= 0 }
}

function utcHHMM(ms: number): string {
  const d = new Date(ms)
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function utcDateLabel(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const mo = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.getUTCDate()
  return `${mo} ${day}`
}

const CHART_GRAD = 'periwinkleGrad'
const TICK_STYLE = { fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }
const GRID_STROKE = 'rgba(170,196,234,0.1)'
const TOOLTIP_STYLE = {
  background: '#10213b',
  border: '1px solid rgba(170,196,234,0.28)',
  borderRadius: 12,
  color: '#eaf1fb',
  fontSize: 12,
}
const TOOLTIP_LABEL_STYLE = { color: '#8da2c0' }
const DEFILLAMA_URL = 'https://defillama.com/chain/arc'

// Slice series for a range choice
function sliceSeries(series: SeriesPoint[], range: '30D' | '90D' | 'All'): SeriesPoint[] {
  if (range === 'All') return series
  const days = range === '30D' ? 30 : 90
  if (series.length === 0) return series
  const cutoff = series[series.length - 1].date - days * 86400
  return series.filter(p => p.date >= cutoff)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceFooter({ updatedAt }: { updatedAt: number }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--faint)]">
      Source: DefiLlama · updated {utcHHMM(updatedAt)} UTC ·{' '}
      <a
        href={DEFILLAMA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-[var(--muted)]"
      >
        defillama.com/chain/arc
        <ExternalLink size={10} />
      </a>
    </p>
  )
}

function CardSkeleton({ height = 240 }: { height?: number }) {
  return <div className="animate-pulse rounded bg-white/5" style={{ height }} />
}

function CardError({ msg }: { msg: string }) {
  return <p className="py-6 text-sm text-[var(--muted)]">{msg}</p>
}

interface KpiTileProps {
  label: string
  value: string
  change: { text: string; positive: boolean } | null
}

function KpiTile({ label, value, change }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="arc-eyebrow !text-[10px]">{label}</p>
      <p className="text-[26px] font-light tabular-nums text-white">{value}</p>
      {change && (
        <p
          className="text-sm tabular-nums"
          style={{ color: change.positive ? 'var(--positive)' : 'var(--negative)' }}
        >
          {change.text}
        </p>
      )}
    </div>
  )
}

interface ChipProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      className={`arc-chip px-3 py-1 text-xs ${active ? 'bg-[var(--periwinkle)] text-[#0a1628]' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// Area chart shared config
function LlamaAreaChart({
  data,
  dataKey,
  gradId,
  tooltipFormatter,
}: {
  data: { date: number; usd: number }[]
  dataKey: string
  gradId: string
  tooltipFormatter: (v: number) => string
}) {
  const chartData = data.map(p => ({ ...p, label: utcDateLabel(p.date) }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a9c4ea" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#a9c4ea" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="label"
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          dataKey={dataKey}
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${compact(Number(v), 0)}`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(v: unknown) => [tooltipFormatter(Number(v)), '']}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke="#a9c4ea"
          strokeWidth={1.8}
          fill={`url(#${gradId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Section 1: KPI row
// ---------------------------------------------------------------------------

function KpiSection() {
  const tvl = useChainTvl()
  const fees = useFees()
  const dexs = useDexs()
  const stables = useStablecoins()

  const [updatedAt] = useState(() => Date.now())

  const tvlSeries = tvl.data ?? []
  const tvlChange = latestAndChange(tvlSeries, 1)

  const feesChange = fees.data ? fmtChange(fees.data.change1d) : null
  const dexsChange = dexs.data ? fmtChange(dexs.data.change1d) : null
  const stableChange7d = stables.data ? stables.data.change7d : null

  const loading = tvl.isLoading || fees.isLoading || dexs.isLoading || stables.isLoading

  return (
    <Reveal className="arc-card p-5">
      <p className="arc-eyebrow mb-5">Snapshot</p>
      {loading ? (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {[0, 1, 2, 3].map(i => <CardSkeleton key={i} height={80} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <KpiTile
            label="Assets in DeFi apps"
            value={tvlSeries.length > 0 ? fmtUsd(tvlSeries[tvlSeries.length - 1].usd) : '—'}
            change={fmtChange(tvlChange.change)}
          />
          <KpiTile
            label="Protocol fees 24h"
            value={fees.data ? fmtUsd(fees.data.total24h) : '—'}
            change={feesChange}
          />
          <KpiTile
            label="DEX volume 24h"
            value={dexs.data ? fmtUsd(dexs.data.total24h) : '—'}
            change={dexsChange}
          />
          <KpiTile
            label="Stablecoin supply"
            value={
              stables.data && stables.data.series.length > 0
                ? fmtUsd(stables.data.series[stables.data.series.length - 1].usd)
                : '—'
            }
            change={fmtChange(stableChange7d?.change ?? null)}
          />
        </div>
      )}
      <p className="mt-4 max-w-[560px] text-xs leading-relaxed text-[var(--faint)]">
        DefiLlama's estimate of assets deposited in DeFi protocols on Arc.
        Not investment advice.
      </p>
      <SourceFooter updatedAt={updatedAt} />
    </Reveal>
  )
}

// ---------------------------------------------------------------------------
// Section 2: "Over time" area chart
// ---------------------------------------------------------------------------

type ChartMetric = 'assets' | 'fees' | 'dex'
type ChartRange = '30D' | '90D' | 'All'

function OverTimeSection() {
  const [metric, setMetric] = useState<ChartMetric>('assets')
  const [range, setRange] = useState<ChartRange>('30D')

  const tvl = useChainTvl()
  const fees = useFees()
  const dexs = useDexs()
  const [updatedAt] = useState(() => Date.now())

  const rawSeries: SeriesPoint[] = useMemo(() => {
    if (metric === 'assets') return tvl.data ?? []
    if (metric === 'fees') return fees.data?.chart ?? []
    return dexs.data?.chart ?? []
  }, [metric, tvl.data, fees.data, dexs.data])

  const fullDaySeries = useMemo(() => lastFullDay(rawSeries), [rawSeries])
  const sliced = useMemo(() => sliceSeries(fullDaySeries, range), [fullDaySeries, range])

  const loading =
    (metric === 'assets' && tvl.isLoading) ||
    (metric === 'fees' && fees.isLoading) ||
    (metric === 'dex' && dexs.isLoading)
  const isError =
    (metric === 'assets' && tvl.isError) ||
    (metric === 'fees' && fees.isError) ||
    (metric === 'dex' && dexs.isError)

  const tooltipFmt = (v: number) =>
    metric === 'assets' ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${compact(v)}`

  return (
    <Reveal className="arc-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="arc-eyebrow">Over time</p>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            {(['assets', 'fees', 'dex'] as ChartMetric[]).map(m => (
              <Chip key={m} active={metric === m} onClick={() => setMetric(m)}>
                {m === 'assets' ? 'Assets in DeFi' : m === 'fees' ? 'Fees' : 'DEX volume'}
              </Chip>
            ))}
          </div>
          <div className="flex gap-1">
            {(['30D', '90D', 'All'] as ChartRange[]).map(r => (
              <Chip key={r} active={range === r} onClick={() => setRange(r)}>
                {r}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <CardSkeleton />
      ) : isError ? (
        <CardError msg="Could not load chart data. It will retry on its own." />
      ) : sliced.length === 0 ? (
        <CardError msg="No data available for this range." />
      ) : (
        <LlamaAreaChart
          data={sliced}
          dataKey="usd"
          gradId={CHART_GRAD}
          tooltipFormatter={tooltipFmt}
        />
      )}
      <p className="mt-2 text-xs text-[var(--faint)]">
        Days are UTC; the latest day may be incomplete.
      </p>
      <SourceFooter updatedAt={updatedAt} />
    </Reveal>
  )
}

// ---------------------------------------------------------------------------
// Section 3: Top protocols by fees
// ---------------------------------------------------------------------------

function ProtocolLogo({ logo, name }: { logo: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.slice(0, 2).toUpperCase()

  if (!logo || failed) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--line)] text-[9px] font-semibold text-[var(--muted)]">
        {initials}
      </span>
    )
  }
  return (
    <img
      src={logo}
      alt={name}
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded"
      onError={() => setFailed(true)}
    />
  )
}

function TopFeesSection() {
  const fees = useFees()
  const [updatedAt] = useState(() => Date.now())
  const top10 = useMemo(
    () => topProtocols(fees.data?.protocols ?? [], 10, 'total24h'),
    [fees.data],
  )

  return (
    <Reveal className="arc-card p-5">
      <p className="arc-eyebrow mb-5">Top protocols by fees</p>
      {fees.isLoading ? (
        <CardSkeleton height={320} />
      ) : fees.isError ? (
        <CardError msg="Could not load protocol data. It will retry on its own." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left">
                <th className="pb-3 text-[var(--faint)] font-normal w-6">#</th>
                <th className="pb-3 text-[var(--faint)] font-normal">Protocol</th>
                <th className="pb-3 text-right text-[var(--faint)] font-normal tabular-nums">24h</th>
                <th className="pb-3 text-right text-[var(--faint)] font-normal tabular-nums">7d</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((p, i) => (
                <tr key={p.slug} className="border-t border-[var(--line)]">
                  <td className="py-2.5 pr-3 text-[var(--faint)] tabular-nums">{i + 1}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <ProtocolLogo logo={p.logo} name={p.displayName || p.name} />
                      <div>
                        <p className="text-white">{p.displayName || p.name}</p>
                        <p className="text-xs text-[var(--faint)]">{p.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-white">
                    {p.total24h > 0 ? fmtUsd(p.total24h) : '—'}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-white">
                    {p.total7d > 0 ? fmtUsd(p.total7d) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SourceFooter updatedAt={updatedAt} />
    </Reveal>
  )
}

// ---------------------------------------------------------------------------
// Section 4: Launchpad fees leaderboard
// ---------------------------------------------------------------------------

const LAUNCHPAD_COLORS = ['#a9c4ea', '#7ea8d6', '#5b8cc2', '#3e72ae', '#2a5a98', '#1a4680']

function LaunchpadSection() {
  const fees = useFees()
  const [updatedAt] = useState(() => Date.now())

  const pads = useMemo(() => launchpads(fees.data?.protocols ?? []), [fees.data])
  const top6 = pads.slice(0, 6)
  const barData = top6.map(p => ({
    name: (p.displayName || p.name).slice(0, 14),
    usd: p.total7d,
  }))

  return (
    <Reveal className="arc-card p-5">
      <p className="arc-eyebrow mb-5">Launchpad fees</p>
      {fees.isLoading ? (
        <CardSkeleton height={300} />
      ) : fees.isError ? (
        <CardError msg="Could not load launchpad data. It will retry on its own." />
      ) : pads.length === 0 ? (
        <p className="py-6 text-sm text-[var(--muted)]">No launchpad activity found.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-3 text-[var(--faint)] font-normal">Launchpad</th>
                  <th className="pb-3 text-right text-[var(--faint)] font-normal tabular-nums">24h</th>
                  <th className="pb-3 text-right text-[var(--faint)] font-normal tabular-nums">7d</th>
                  <th className="pb-3 text-right text-[var(--faint)] font-normal tabular-nums">30d</th>
                  <th className="pb-3 text-right text-[var(--faint)] font-normal tabular-nums">All time</th>
                  <th className="pb-3 text-right text-[var(--faint)] font-normal">24h change</th>
                </tr>
              </thead>
              <tbody>
                {pads.slice(0, 10).map(p => {
                  const ch = fmtChange(p.change1d)
                  return (
                    <tr key={p.slug} className="border-t border-[var(--line)]">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <ProtocolLogo logo={p.logo} name={p.displayName || p.name} />
                          <span className="text-white">{p.displayName || p.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-white">
                        {p.total24h > 0 ? fmtUsd(p.total24h) : '—'}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-white">
                        {p.total7d > 0 ? fmtUsd(p.total7d) : '—'}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-white">
                        {p.total30d > 0 ? fmtUsd(p.total30d) : '—'}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-white">
                        {p.totalAllTime != null && p.totalAllTime > 0 ? fmtUsd(p.totalAllTime) : '—'}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {ch ? (
                          <span style={{ color: ch.positive ? 'var(--positive)' : 'var(--negative)' }}>
                            {ch.text}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {top6.length > 1 && (
            <div className="mt-6">
              <p className="arc-eyebrow mb-3 !text-[10px]">Top 6 by 7d fees</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${compact(Number(v), 0)}`} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(v: unknown) => [fmtUsd(Number(v)), '7d fees']}
                  />
                  {barData.map((_, i) => (
                    <Bar key={i} dataKey="usd" isAnimationActive={false}>
                      <Cell fill={LAUNCHPAD_COLORS[i % LAUNCHPAD_COLORS.length]} />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="mt-3 text-xs text-[var(--faint)]">
            Fee methodology differs by protocol.
          </p>
        </>
      )}
      <SourceFooter updatedAt={updatedAt} />
    </Reveal>
  )
}

// ---------------------------------------------------------------------------
// Section 5: Where trading happens
// ---------------------------------------------------------------------------

function TradingVenuesSection() {
  const dexs = useDexs()
  const [updatedAt] = useState(() => Date.now())

  const { rows, venuesSum, providerTotal, mismatch } = useMemo(() => {
    if (!dexs.data) return { rows: [], venuesSum: 0, providerTotal: 0, mismatch: false }
    const result = venueShares(dexs.data.protocols, 6, dexs.data.total24h)
    const mm = headlineMismatch(result.providerTotal, result.venuesSum)
    return { ...result, mismatch: mm }
  }, [dexs.data])

  const maxShare = rows[0]?.share ?? 1

  return (
    <Reveal className="arc-card p-5">
      <p className="arc-eyebrow mb-3">Where trading happens</p>
      {dexs.isLoading ? (
        <CardSkeleton height={220} />
      ) : dexs.isError ? (
        <CardError msg="Could not load DEX data. It will retry on its own." />
      ) : (
        <>
          {mismatch && (
            <p className="mb-4 rounded-md bg-white/5 px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
              DefiLlama's chain total ({fmtUsd(providerTotal)}) is larger than the sum of the
              listed venues ({fmtUsd(venuesSum)}); shares below use the venue sum.
            </p>
          )}
          <ul className="space-y-3">
            {rows.map((row, i) => (
              <li key={row.name}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[15px] font-light text-white">{row.name}</span>
                  <span className="text-sm tabular-nums text-[var(--muted)]">
                    {(row.share * 100).toFixed(1)}%
                    {row.total24h > 0 && (
                      <span className="ml-2 text-[var(--faint)]">
                        ({fmtUsd(row.total24h)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-px w-full bg-[var(--line)]">
                  <motion.div
                    className="h-px origin-left bg-[var(--periwinkle)]"
                    style={{ opacity: Math.max(0.3, 1 - i * 0.12) }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: maxShare > 0 ? row.share / maxShare : 0 }}
                    transition={{ duration: 0.9, delay: i * 0.06, ease: [0.19, 1, 0.22, 1] }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <SourceFooter updatedAt={updatedAt} />
    </Reveal>
  )
}

// ---------------------------------------------------------------------------
// Section 6: Stablecoin supply
// ---------------------------------------------------------------------------

function StablecoinSection() {
  const [range, setRange] = useState<ChartRange>('30D')
  const stables = useStablecoins()
  const [updatedAt] = useState(() => Date.now())

  const fullSeries = useMemo(
    () => (stables.data ? lastFullDay(stables.data.series) : []),
    [stables.data],
  )
  const sliced = useMemo(() => sliceSeries(fullSeries, range), [fullSeries, range])

  const stableSeries = stables.data?.series ?? []
  const latest = stableSeries.length > 0 ? stableSeries[stableSeries.length - 1].usd : undefined
  const change7d = stables.data?.change7d ?? null

  return (
    <Reveal className="arc-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="arc-eyebrow">Stablecoin supply on Arc</p>
          {latest != null && (
            <p className="mt-1 text-xl font-light tabular-nums text-white">
              {fmtUsd(latest)}
              {change7d && fmtChange(change7d.change) && (
                <span
                  className="ml-2 text-sm"
                  style={{
                    color: (fmtChange(change7d.change)?.positive ?? false)
                      ? 'var(--positive)'
                      : 'var(--negative)',
                  }}
                >
                  {fmtChange(change7d.change)?.text} 7d
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {(['30D', '90D', 'All'] as ChartRange[]).map(r => (
            <Chip key={r} active={range === r} onClick={() => setRange(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>

      {stables.isLoading ? (
        <CardSkeleton />
      ) : stables.isError ? (
        <CardError msg="Could not load stablecoin data. It will retry on its own." />
      ) : sliced.length === 0 ? (
        <CardError msg="No stablecoin data available for this range." />
      ) : (
        <LlamaAreaChart
          data={sliced}
          dataKey="usd"
          gradId="stableGrad"
          tooltipFormatter={v => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
        />
      )}
      <p className="mt-2 text-xs text-[var(--faint)]">
        Days are UTC; the latest day may be incomplete.
      </p>
      <SourceFooter updatedAt={updatedAt} />
    </Reveal>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Defi() {
  if (NETWORK.id !== 5042) {
    return (
      <div className="space-y-14">
        <Reveal>
          <section className="pt-4">
            <p className="arc-eyebrow mb-5">{`DeFi · ${NETWORK.name}`}</p>
            <SplitLines
              as="h1"
              className="arc-display text-[clamp(40px,6vw,80px)] text-white"
              lines={[
                { text: 'Money at' },
                { text: 'work.', className: 'text-[var(--periwinkle)]' },
              ]}
            />
          </section>
        </Reveal>
        <MainnetPending title="DeFi on Arc">
          DefiLlama tracks Arc Mainnet only — this section is not available on testnet.
        </MainnetPending>
      </div>
    )
  }

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">{`DeFi · ${NETWORK.name}`}</p>
          <SplitLines
            as="h1"
            className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[
              { text: 'Money at' },
              { text: 'work.', className: 'text-[var(--periwinkle)]' },
            ]}
          />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Protocol activity, trading, and stablecoins on Arc — sourced from DefiLlama.
          </p>
        </section>
      </Reveal>

      <section>
        <KpiSection />
      </section>

      <section>
        <OverTimeSection />
      </section>

      <section>
        <TopFeesSection />
      </section>

      <section>
        <LaunchpadSection />
      </section>

      <section>
        <TradingVenuesSection />
      </section>

      <section>
        <StablecoinSection />
      </section>
    </div>
  )
}
