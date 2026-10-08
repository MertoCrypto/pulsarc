import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { RankCell } from './RankCell'
import { CategoryBadge, VerifiedBadge, AppLogoBadge } from '@/components/shared/Badge'
import { type RankedApp } from '@/hooks/useAllMetrics'
import { type SortKey } from '@/hooks/useAllMetrics'

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toString()
}

interface ColDef {
  key: SortKey
  label: string
  render: (item: RankedApp) => string
}

// "≈" = extrapolated from the newest activity; "≥" = at least this many (sampled).
const COLS: ColDef[] = [
  { key: 'txCount',       label: 'Transactions', render: r => `${r.metrics.estimated ? '≈' : ''}${fmtNum(r.metrics.txCount)}` },
  { key: 'activeWallets', label: 'Users',       render: r => r.metrics.lifetime && !r.metrics.usersKnown ? '—' : `${r.metrics.estimated ? '≥' : ''}${fmtNum(r.metrics.activeWallets)}` },
  { key: 'volume',        label: 'Volume',       render: r => r.metrics.volume === null ? '—' : `${r.metrics.estimated ? '≈' : ''}${fmt(r.metrics.volume)}` },
  { key: 'tvl',           label: 'USDC held',    render: r => r.metrics.tvl === null ? '—' : fmt(r.metrics.tvl) },
  { key: 'usdcFees',      label: 'Fees paid',    render: r => r.metrics.usdcFees === null ? '—' : `${r.metrics.estimated ? '≈' : ''}$${r.metrics.usdcFees.toFixed(4)}` },
]

/** Change versus the window before; "new" when that had no activity; "—" when there is too little history. */
function Change({ now, prev, approx }: { now: number; prev: number; approx: boolean }) {
  const mark = approx ? '≈' : ''
  if (prev === 0) return now > 0 ? <span className="text-[var(--periwinkle)]">new</span> : <span className="text-[var(--faint)]">—</span>
  const pct = ((now - prev) / prev) * 100
  if (Math.abs(pct) < 0.5) return <span className="text-[var(--muted)]">{mark}0%</span>
  const shown = Math.abs(pct) >= 1000 ? `${Math.round(Math.abs(pct) / 100) / 10}k%` : `${Math.round(Math.abs(pct))}%`
  return pct > 0
    ? <span className="text-emerald-300">{mark}▲ {shown}</span>
    : <span className="text-rose-300/90">{mark}▼ {shown}</span>
}

interface Props {
  items: RankedApp[]
  isLoading: boolean
  sortKey: SortKey
  onSortChange: (k: SortKey) => void
}

export function LeaderboardTable({ items, isLoading, sortKey, onSortChange }: Props) {
  const navigate = useNavigate()

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th className="text-left px-5 py-3.5 arc-eyebrow !text-[10px] !tracking-[0.18em] w-14">Rank</th>
            <th className="text-left px-5 py-3.5 arc-eyebrow !text-[10px] !tracking-[0.18em]">App</th>
            <th className="text-left px-5 py-3.5 arc-eyebrow !text-[10px] !tracking-[0.18em] w-24">Category</th>
            {COLS.map(col => (
              <th key={col.key} className="text-right px-5 py-3.5 w-32">
                <button
                  onClick={() => onSortChange(col.key)}
                  className={clsx(
                    'arc-eyebrow !text-[10px] !tracking-[0.18em] inline-flex items-center gap-1 transition-colors hover:!text-white',
                    sortKey === col.key ? '!text-[var(--periwinkle)]' : ''
                  )}
                >
                  {col.label}
                  {sortKey === col.key ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3 opacity-30" />}
                </button>
              </th>
            ))}
            <th className="text-right px-5 py-3.5 w-28 arc-eyebrow !text-[10px] !tracking-[0.18em]" title="Versus the window just before this one">Change</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[rgba(170,196,234,0.09)]">
                  <td className="px-5 py-4"><div className="h-4 w-6 rounded bg-white/8 animate-pulse" /></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/8 animate-pulse" />
                      <div className="h-4 w-28 rounded bg-white/8 animate-pulse" />
                    </div>
                  </td>
                  <td className="px-5 py-4"><div className="h-4 w-14 rounded bg-white/8 animate-pulse" /></td>
                  <td className="px-5 py-4"><div className="h-6 w-14 rounded bg-white/8 animate-pulse" /></td>
                  {[...COLS, { key: 'change' }].map(c => (
                    <td key={c.key} className="px-5 py-4 text-right">
                      <div className="h-4 w-16 rounded bg-white/8 animate-pulse ml-auto" />
                    </td>
                  ))}
                </tr>
              ))
            : items.map(item => (
                <motion.tr
                  key={item.app.id}
                  layout
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  onClick={() => void navigate(`/dapp/${item.app.id}`)}
                  className="arc-row group cursor-pointer border-b border-[rgba(170,196,234,0.09)]"
                >
                  <td className="px-5 py-4">
                    <RankCell rank={item.rank} change={item.metrics.rankChange} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <AppLogoBadge initials={item.app.logoInitials} color={item.app.logoColor} logo={item.app.logo} logoIcon={item.app.logoIcon} size="md" />
                      <div>
                        <p className="text-[15px] font-medium text-white group-hover:text-[var(--periwinkle)] transition-colors">
                          {item.app.name}
                        </p>
                        {item.app.verified && (
                          <VerifiedBadge size="sm" />
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <CategoryBadge category={item.app.category} />
                  </td>
                  {COLS.map(col => (
                    <td key={col.key} className={clsx(
                      'px-5 py-4 text-right text-[15px] tabular-nums',
                      sortKey === col.key ? 'text-white' : 'text-[var(--muted)]'
                    )}>
                      {col.render(item)}
                    </td>
                  ))}
                  <td className="px-5 py-4 text-right text-[15px] tabular-nums">
                    {(() => {
                      const t = item.metrics.trend
                      if (!t) return <span className="text-[var(--faint)]" title="Not enough activity to compare">—</span>
                      return sortKey === 'activeWallets'
                        ? <Change now={t.walletsNow} prev={t.walletsPrev} approx={t.approx} />
                        : <Change now={t.txNow} prev={t.txPrev} approx={t.approx} />
                    })()}
                  </td>
                </motion.tr>
              ))
          }
        </tbody>
      </table>
    </div>
  )
}
