/**
 * DataFreshnessCard — shows the freshness of every checked catalog data file.
 *
 * Wire into the /status page yourself:
 *   import { DataFreshnessCard } from '@/components/status/DataFreshnessCard'
 *   <DataFreshnessCard net="testnet" />
 */

import { useDataFreshness } from '@/hooks/useDataFreshness'
import { formatAge, summarize, type FreshState } from '@/lib/dataFreshness'

interface Props {
  net: 'mainnet' | 'testnet'
}

// ── State dot ─────────────────────────────────────────────────────────────────

function StateDot({ state }: { state: FreshState }) {
  if (state === 'fresh') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] opacity-60" />
        fresh
      </span>
    )
  }
  const label = state === 'missing' ? 'missing' : state === 'stale' ? 'stale' : 'unknown'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
      {label}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="arc-card overflow-hidden">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <p className="arc-eyebrow">Data freshness</p>
      </div>
      <div className="space-y-2 px-5 py-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="arc-card h-9 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ── DataFreshnessCard ─────────────────────────────────────────────────────────

export function DataFreshnessCard({ net }: Props) {
  const { rows, isLoading } = useDataFreshness(net)

  if (isLoading) return <LoadingSkeleton />

  const summary = summarize(rows)
  const anyAttention = rows.some(r => r.state !== 'fresh')

  return (
    <div className="arc-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--line)] px-5 py-4">
        <p className="arc-eyebrow mb-1">Data freshness</p>
        <p
          className={`text-sm ${
            anyAttention ? 'text-amber-300' : 'text-[var(--muted)]'
          }`}
        >
          {summary}
        </p>
      </div>

      {/* File list */}
      <ul className="divide-y divide-[var(--line)]">
        {rows.map(row => (
          <li
            key={row.file}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-5 py-3"
          >
            {/* File name + title */}
            <span className="min-w-0">
              <span className="block font-['Geist_Mono'] text-xs text-white">
                {row.file}
              </span>
              <span className="block truncate text-xs text-[var(--faint)]">
                {row.title}
              </span>
            </span>

            {/* Age */}
            <span className="whitespace-nowrap text-xs text-[var(--faint)]">
              {formatAge(row.ageMin)}
            </span>

            {/* State indicator */}
            <StateDot state={row.state} />
          </li>
        ))}
      </ul>

      {/* Footnote */}
      <p className="border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--faint)]">
        Some cards on the site hide themselves when their data file is stale.
      </p>
    </div>
  )
}
