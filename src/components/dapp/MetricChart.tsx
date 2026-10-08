import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { type HistoryPoint } from '@/lib/appActivity'

interface MetricChartProps {
  title: string
  data: HistoryPoint[]
  dataKey: keyof Omit<HistoryPoint, 'label'>
  formatter?: (v: number) => string
  isLoading?: boolean
  empty?: string
}

function defaultFmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

export function MetricChart({ title, data, dataKey, formatter = defaultFmt, isLoading, empty = 'Nothing recorded in this window.' }: MetricChartProps) {
  const hasData = data.some(p => p[dataKey] > 0)

  return (
    <div className="arc-card p-5">
      <p className="arc-eyebrow mb-5">{title}</p>
      {isLoading ? (
        <div className="flex h-[180px] items-end gap-1.5 px-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex-1 animate-pulse rounded-t bg-white/6" style={{ height: `${30 + ((i * 13) % 60)}%` }} />
          ))}
        </div>
      ) : !hasData ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-[var(--faint)]">{empty}</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 0, left: -14, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(170,196,234,0.1)" />
            <XAxis dataKey="label" tick={{ fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: '#8da2c0', fontSize: 10, fontFamily: 'Geist Mono' }} axisLine={false} tickLine={false} tickFormatter={formatter} />
            <Tooltip
              cursor={{ fill: 'rgba(169,196,234,0.08)' }}
              contentStyle={{ background: '#10213b', border: '1px solid rgba(170,196,234,0.28)', borderRadius: 12, color: '#eaf1fb', fontSize: 12 }}
              labelStyle={{ color: '#8da2c0', marginBottom: 4 }}
              formatter={(v) => [formatter(typeof v === 'number' ? v : 0), title]}
            />
            <Bar dataKey={dataKey as string} fill="#a9c4ea" radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
