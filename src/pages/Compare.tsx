import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ARC_APPS, appById } from '@/data/apps'
import { FilterBar } from '@/components/shared/FilterBar'
import { AppLogoBadge } from '@/components/shared/Badge'
import { Reveal } from '@/components/shared/Reveal'
import { useCompareHistory } from '@/hooks/useAppHistory'
import { describeSpan, type TimeRange } from '@/lib/appActivity'
import { compact, count } from '@/lib/arcscan'

const MAX_APPS = 4

// Same family of blues and whites; dashes tell the lines apart without a rainbow.
const STYLES = [
  { stroke: '#a9c4ea', dash: undefined },
  { stroke: '#ffffff', dash: '6 4' },
  { stroke: '#3b7bff', dash: undefined },
  { stroke: '#78c4e8', dash: '2 4' },
]

type MetricKey = 'txCount' | 'activeWallets' | 'volume' | 'usdcFees'
const METRICS: { key: MetricKey; label: string; fmt: (v: number) => string }[] = [
  { key: 'txCount', label: 'Transactions', fmt: v => count(v) },
  { key: 'activeWallets', label: 'Active wallets', fmt: v => count(v) },
  { key: 'volume', label: 'Dollars moved', fmt: v => `$${compact(v, 1)}` },
  { key: 'usdcFees', label: 'Gas fees paid', fmt: v => `$${v.toFixed(4)}` },
]

export function Compare() {
  const [ids, setIds] = useState<string[]>(['xylonet', 'curve-usdc-eurc'])
  const [search, setSearch] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')

  const selected = ids.map(appById).flatMap(a => (a ? [a] : []))
  const { history, metrics, isLoading } = useCompareHistory(selected, timeRange)

  const candidates = ARC_APPS.filter(a =>
    !ids.includes(a.id) && (search.length === 0 || a.name.toLowerCase().includes(search.toLowerCase())),
  ).slice(0, 8)

  const merged = useMemo(() => {
    const n = history.total.length
    return Array.from({ length: n }, (_, i) => {
      const row: Record<string, number | string> = { label: history.total[i].label }
      for (const app of selected) {
        const pt = history.perApp[app.id]?.[i]
        if (!pt) continue
        for (const m of METRICS) row[`${app.id}_${m.key}`] = pt[m.key]
      }
      return row
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, ids.join(',')])

  const add = (id: string) => { if (ids.length < MAX_APPS) setIds([...ids, id]); setSearch('') }
  const remove = (id: string) => setIds(ids.filter(x => x !== id))

  return (
    <div className="space-y-8">
      <Reveal>
        <section className="pt-4">
          <p className="arc-eyebrow mb-5">Compare · Arc Testnet</p>
          <h1 className="arc-display text-[clamp(36px,5vw,64px)] text-white">Side by side, on the same clock.</h1>
          <p className="mt-5 max-w-[560px] text-lg font-light leading-relaxed text-[var(--muted)]">
            Pick up to {MAX_APPS} apps. Their activity is placed on one shared timeline, so the lines mean the same thing.
          </p>
        </section>
      </Reveal>

      <div className="arc-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((app, i) => (
            <span key={app.id} className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--line-strong)] px-3 py-1.5 text-sm text-white">
              <span className="h-px w-5" style={{ background: STYLES[i].stroke, borderTop: STYLES[i].dash ? `1px dashed ${STYLES[i].stroke}` : undefined }} />
              {app.name}
              <button onClick={() => remove(app.id)} className="text-[var(--muted)] hover:text-white" aria-label={`Remove ${app.name}`}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          {ids.length < MAX_APPS && (
            <label className="flex min-w-[200px] flex-1 items-center gap-2 px-2">
              <Search className="h-3.5 w-3.5 text-[var(--muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Add an app…"
                className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-[var(--faint)]" />
            </label>
          )}
        </div>
        {ids.length < MAX_APPS && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
            {candidates.map(app => (
              <button key={app.id} onClick={() => add(app.id)} className="arc-chip inline-flex items-center gap-2">
                <AppLogoBadge initials={app.logoInitials} color={app.logoColor} logo={app.logo} logoIcon={app.logoIcon} size="sm" /> {app.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <div className="arc-card px-6 py-16 text-center text-[var(--muted)]">Add an app to start comparing.</div>
      ) : (
        <>
          <FilterBar timeRange={timeRange} onTimeRangeChange={v => setTimeRange(v as TimeRange)} ranges={['1h', '24h']} category="All" onCategoryChange={() => {}} hideCategories />

          <Reveal className="arc-card overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {['App', 'Transactions', 'Wallets', 'Dollars moved', 'USDC held'].map((h, i) => (
                    <th key={h} className={`arc-eyebrow !text-[10px] px-5 py-3.5 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.map(app => {
                  const m = metrics[app.id]
                  return (
                    <tr key={app.id} className="arc-row border-b border-[rgba(170,196,234,0.09)]">
                      <td className="px-5 py-3.5 text-[15px] text-white">{app.name}</td>
                      {!m ? (
                        <td colSpan={4} className="px-5 py-3.5"><div className="ml-auto h-4 w-40 animate-pulse rounded bg-white/6" /></td>
                      ) : (
                        <>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-white">{m.estimated ? '≈' : ''}{count(m.txCount)}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{m.estimated ? '≥' : ''}{m.activeWallets}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{m.volume === null ? '—' : `$${compact(m.volume, 1)}`}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-[var(--muted)]">{m.tvl === null ? '—' : `$${compact(m.tvl, 1)}`}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Reveal>

          {!isLoading && !history.complete && (
            <p className="arc-panel px-4 py-3 text-sm leading-relaxed text-[var(--muted)]">
              One of these apps is busier than ArcScan lets us read in one go, so every chart shows the same latest {describeSpan(history.coveredMs)}. Totals in the table are scaled to the full window.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {METRICS.map(metric => (
              <div key={metric.key} className="arc-card p-5">
                <p className="arc-eyebrow mb-5">{metric.label}</p>
                {isLoading ? (
                  <div className="h-[180px] animate-pulse rounded bg-white/5" />
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={merged} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgba(170,196,234,0.1)" />
                      <XAxis dataKey="label" tick={{ fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis tick={{ fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }} axisLine={false} tickLine={false} tickFormatter={metric.fmt} />
                      <Tooltip
                        contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb', fontSize: 12 }}
                        labelStyle={{ color: '#8da2c0', marginBottom: 4 }}
                        formatter={(v) => metric.fmt(typeof v === 'number' ? v : 0)}
                      />
                      {selected.map((app, i) => (
                        <Line key={app.id} type="monotone" dataKey={`${app.id}_${metric.key}`} name={app.name}
                          stroke={STYLES[i].stroke} strokeDasharray={STYLES[i].dash} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
