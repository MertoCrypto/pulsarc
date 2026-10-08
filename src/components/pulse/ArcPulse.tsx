import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useAllMetrics } from '@/hooks/useAllMetrics'
import { useNetworkStats } from '@/hooks/useNetworkStats'
import { useChainOverview } from '@/hooks/useTokens'
import { AppLogoBadge } from '@/components/shared/Badge'
import { compact, count } from '@/lib/arcscan'

interface Props {
  onClose: () => void
}

/** Full-screen live view: chain throughput from the latest blocks, busiest apps from ArcScan. */
export function ArcPulse({ onClose }: Props) {
  const { items } = useAllMetrics('1h', 'txCount', 'All')
  const net = useNetworkStats()
  const overview = useChainOverview()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats = [
    { label: 'Last full day', value: overview.data ? compact(overview.data.transactionsToday, 2) : '—' },
    { label: 'Throughput', value: net.tps !== null ? `${net.tps.toFixed(1)} tx/s` : '—' },
    { label: 'Block time', value: net.avgBlockTimeSec !== null ? `${net.avgBlockTimeSec.toFixed(2)} s` : '—' },
    { label: 'Block fullness', value: net.avgFullness !== null ? `${(net.avgFullness * 100).toFixed(1)}%` : '—' },
  ]

  const top = items.slice(0, 6)

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[#08111f]">
      <button
        onClick={onClose}
        className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--muted)] transition-colors hover:text-white"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="mx-auto w-full max-w-[1100px] px-6 py-16">
        <p className="arc-eyebrow mb-4">Pulse · Arc Testnet</p>
        <h1 className="arc-display text-[clamp(36px,5vw,64px)] text-white">What the chain is doing, right now.</h1>

        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(s => (
            <div key={s.label} className="arc-card p-5">
              <p className="arc-eyebrow !text-[10px]">{s.label}</p>
              <p className="mt-4 text-[32px] font-light leading-none tracking-tight tabular-nums text-white">{s.value}</p>
            </div>
          ))}
        </div>

        <p className="arc-eyebrow mb-4 mt-12">Busiest apps · last hour</p>
        <div className="arc-card divide-y divide-[var(--line)] overflow-hidden">
          {top.length === 0 && <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">Reading apps…</p>}
          {top.map((item, i) => (
            <div key={item.app.id} className="flex items-center gap-4 px-5 py-4">
              <span className="w-6 text-sm tabular-nums text-[var(--faint)]">{String(i + 1).padStart(2, '0')}</span>
              <AppLogoBadge initials={item.app.logoInitials} color={item.app.logoColor} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-light text-white">{item.app.name}</p>
                <p className="arc-eyebrow !text-[10px]">{item.app.category}</p>
              </div>
              <div className="text-right">
                <p className="text-[17px] tabular-nums text-white">{item.metrics.estimated ? '≈' : ''}{count(item.metrics.txCount)} tx</p>
                <p className="text-xs tabular-nums text-[var(--muted)]">{item.metrics.estimated ? '≥' : ''}{item.metrics.activeWallets} wallets</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
