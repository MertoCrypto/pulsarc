import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { type RankedApp } from '@/hooks/useAllMetrics'

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

/** Continuous marquee of live app activity — the row is duplicated so the loop is seamless. */
export function Ticker({ items }: { items: RankedApp[] }) {
  const lane = useMemo(() => items.slice(0, 12), [items])
  if (lane.length === 0) return null

  return (
    <div className="relative -mx-6 overflow-hidden border-y border-[var(--line)] bg-[rgba(16,33,59,0.4)] py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#0b182c] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#0b182c] to-transparent" />

      <div className="flex w-max animate-[arc-marquee_52s_linear_infinite] hover:[animation-play-state:paused]">
        {[0, 1].map(copy => (
          <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
            {lane.map(item => {
              const up = item.metrics.rankChange > 0
              const flat = item.metrics.rankChange === 0
              return (
                <Link
                  key={`${copy}-${item.app.id}`}
                  to={`/dapp/${item.app.id}`}
                  className="group flex items-center gap-2.5 whitespace-nowrap px-6"
                >
                  <span className="h-1 w-1 rounded-full bg-[var(--periwinkle)]" />
                  <span className="text-sm text-[var(--muted)] transition-colors group-hover:text-white">
                    {item.app.name}
                  </span>
                  <span className="text-sm tabular-nums text-white">
                    {fmtCount(item.metrics.txCount)} tx
                  </span>
                  <span
                    className="text-xs tabular-nums"
                    style={{
                      color: flat ? 'var(--faint)' : up ? 'var(--text)' : 'var(--faint)',
                    }}
                  >
                    {flat ? '—' : `${up ? '▲' : '▼'}${Math.abs(item.metrics.rankChange)}`}
                  </span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
