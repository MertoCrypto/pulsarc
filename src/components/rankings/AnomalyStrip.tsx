import { TrendingUp, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AnomaliesSnap } from '@/lib/anomalies'
import { isAnomaliesFresh, describeAnomaly } from '@/lib/anomalies'
import { appById } from '@/data/apps'

interface Props {
  snap: AnomaliesSnap | null | undefined
}

/**
 * A thin strip of anomaly pills placed above the rankings table.
 * Renders nothing when data is absent, stale, or empty.
 */
export function AnomalyStrip({ snap }: Props) {
  if (!snap) return null
  if (!isAnomaliesFresh(snap)) return null
  if (snap.items.length === 0) return null

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="arc-eyebrow shrink-0 !text-[10px]">Moving now</span>
      {snap.items.map((item, i) => {
        const appEntry = appById(item.app)
        const name = appEntry?.name ?? item.app
        const text = describeAnomaly(item, name)

        const pill = (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-3 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:text-white"
          >
            {item.kind === 'spike' ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-[var(--periwinkle)]" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0 text-[#f87171]" />
            )}
            {text}
          </span>
        )

        if (appEntry) {
          return (
            <Link key={i} to={`/dapp/${item.app}`} className="no-underline">
              {pill}
            </Link>
          )
        }
        return pill
      })}
    </div>
  )
}
