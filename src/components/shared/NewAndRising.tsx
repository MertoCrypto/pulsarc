import { useNavigate } from 'react-router-dom'
import { useAllMetrics } from '@/hooks/useAllMetrics'
import { count } from '@/lib/arcscan'

/** The busiest apps in the last hour, from real activity. */
export function NewAndRising() {
  const navigate = useNavigate()
  const { items, isLoading } = useAllMetrics('1h', 'txCount', 'All', { defer: true })
  const apps = items.slice(0, 4)

  return (
    <section className="arc-card p-5">
      <header className="flex items-baseline justify-between">
        <p className="arc-eyebrow">Busiest</p>
        <p className="text-sm text-[var(--muted)]">last hour</p>
      </header>

      {isLoading || apps.length === 0 ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-9 animate-pulse rounded bg-white/6" />)}
        </div>
      ) : (
        <ol className="mt-3">
          {apps.map((item, i) => (
            <li key={item.app.id} className="border-t border-[var(--line)] first:border-t-0">
              <button
                onClick={() => { void navigate(`/dapp/${item.app.id}`) }}
                className="group flex w-full items-baseline gap-4 py-3.5 text-left"
              >
                <span className="w-5 text-xs tabular-nums text-[var(--faint)]">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-light text-white transition-transform duration-300 group-hover:translate-x-1">
                    {item.app.name}
                  </span>
                  <span className="arc-eyebrow !text-[10px] !tracking-[0.16em]">{item.app.category}</span>
                </span>
                <span className="text-sm tabular-nums text-[var(--muted)]">
                  {item.metrics.estimated ? '≈' : ''}{count(item.metrics.txCount)} tx
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
