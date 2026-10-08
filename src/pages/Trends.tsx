import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { motion } from 'framer-motion'
import { ARC_APPS, CATEGORIES, type AppCategory } from '@/data/apps'
import { FilterBar } from '@/components/shared/FilterBar'
import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'
import { useAllMetrics } from '@/hooks/useAllMetrics'
import { useChainDaily } from '@/hooks/useChainDaily'
import { type TimeRange } from '@/lib/appActivity'
import { compact, count } from '@/lib/arcscan'

type Measure = 'txCount' | 'activeWallets' | 'volume' | 'usdcFees'
const MEASURES: { key: Measure; label: string; fmt: (v: number) => string }[] = [
  { key: 'txCount', label: 'Transactions', fmt: v => count(v) },
  { key: 'activeWallets', label: 'Active wallets', fmt: v => count(v, 0) },
  { key: 'volume', label: 'Dollars moved', fmt: v => `$${compact(v, 1)}` },
  { key: 'usdcFees', label: 'Gas fees paid', fmt: v => `$${v.toFixed(3)}` },
]

export function Trends() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const daily = useChainDaily()
  const { items, isLoading, loaded, total } = useAllMetrics(timeRange, 'txCount', 'All')

  const byCategory = useMemo(() => {
    const rows: Record<AppCategory, Record<Measure, number>> = Object.fromEntries(
      CATEGORIES.map(c => [c, { txCount: 0, activeWallets: 0, volume: 0, usdcFees: 0 }]),
    ) as Record<AppCategory, Record<Measure, number>>
    for (const { app, metrics } of items) {
      const r = rows[app.category]
      r.txCount += metrics.txCount
      r.activeWallets += metrics.activeWallets
      r.volume += metrics.volume ?? 0
      r.usdcFees += metrics.usdcFees ?? 0
    }
    return rows
  }, [items])

  const week = daily.data?.slice(-30) ?? []
  const peak = week.reduce((m, p) => Math.max(m, p.transactions), 0)
  const avg = week.length ? week.reduce((s, p) => s + p.transactions, 0) / week.length : 0

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Trends · Arc Testnet</p>
          <SplitLines as="h1" className="arc-display text-[clamp(40px,6vw,80px)] text-white"
            lines={[{ text: 'The shape of' }, { text: 'activity.', className: 'text-[var(--periwinkle)]' }]} />
          <p className="mt-6 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            How busy the whole chain has been day by day, and which kinds of apps the activity is flowing into right now.
          </p>
        </section>
      </Reveal>

      <section>
        <p className="arc-eyebrow mb-4">Chain-wide · transactions per day</p>
        <Reveal className="arc-card p-5">
          {daily.isLoading ? (
            <div className="h-[260px] animate-pulse rounded bg-white/5" />
          ) : daily.isError || week.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--muted)]">ArcScan did not return the daily chart. It will retry on its own.</p>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap gap-x-10 gap-y-3">
                <div><p className="arc-eyebrow !text-[10px]">Daily average</p><p className="mt-1 text-[28px] font-light tabular-nums text-white">{compact(avg, 2)}</p></div>
                <div><p className="arc-eyebrow !text-[10px]">Busiest day</p><p className="mt-1 text-[28px] font-light tabular-nums text-white">{compact(peak, 2)}</p></div>
                <div><p className="arc-eyebrow !text-[10px]">Window</p><p className="mt-1 text-[28px] font-light tabular-nums text-white">{week.length} days</p></div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={week} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a9c4ea" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#a9c4ea" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(170,196,234,0.1)" />
                  <XAxis dataKey="label" tick={{ fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }} axisLine={false} tickLine={false} tickFormatter={v => compact(v, 1)} />
                  <Tooltip
                    contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb', fontSize: 12 }}
                    labelStyle={{ color: '#8da2c0' }}
                    formatter={(v) => [Number(v).toLocaleString(), 'transactions']}
                  />
                  <Area type="monotone" dataKey="transactions" stroke="#a9c4ea" strokeWidth={1.8} fill="url(#dailyFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </Reveal>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <p className="arc-eyebrow">Tracked apps · by category</p>
          <FilterBar timeRange={timeRange} onTimeRangeChange={v => setTimeRange(v as TimeRange)} ranges={['1h', '24h']} category="All" onCategoryChange={() => {}} hideCategories />
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="arc-card h-[260px] animate-pulse" />)}</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {MEASURES.map(m => {
              const rows = CATEGORIES.map(c => ({ c, v: byCategory[c][m.key] })).sort((a, b) => b.v - a.v)
              const max = rows[0]?.v || 1
              return (
                <Reveal key={m.key} className="arc-card p-5">
                  <p className="arc-eyebrow mb-5">{m.label}</p>
                  <ul className="space-y-4">
                    {rows.map((r, i) => (
                      <li key={r.c}>
                        <div className="mb-1.5 flex items-baseline justify-between">
                          <span className="text-[15px] font-light text-white">{r.c}</span>
                          <span className="text-sm tabular-nums text-[var(--muted)]">{r.v > 0 ? m.fmt(r.v) : '—'}</span>
                        </div>
                        <div className="h-px w-full bg-[var(--line)]">
                          <motion.div className="h-px origin-left bg-[var(--periwinkle)]" style={{ opacity: Math.max(0.35, 1 - i * 0.14) }}
                            initial={{ scaleX: 0 }} animate={{ scaleX: r.v / max }} transition={{ duration: 0.9, delay: i * 0.05, ease: [0.19, 1, 0.22, 1] }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )
            })}
          </div>
        )}
        <p className="mt-4 max-w-[680px] text-sm leading-relaxed text-[var(--faint)]">
          {loaded < total ? `Still reading apps (${loaded}/${total}) — totals grow as they arrive. ` : ''}
          Based on the {ARC_APPS.length} tracked apps only. Busy apps are extrapolated from their newest activity; wallet counts are lower bounds and may overlap between apps.
        </p>
      </section>
    </div>
  )
}
