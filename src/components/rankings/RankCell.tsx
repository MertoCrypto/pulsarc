import { ArrowDown, ArrowUp } from 'lucide-react'

interface RankCellProps {
  rank: number
  change: number // places gained (+) or lost (−) since this browser last saw the ranking
}

export function RankCell({ rank, change }: RankCellProps) {
  return (
    <div className="flex min-w-[36px] flex-col items-start gap-0.5">
      <span className="text-[15px] font-light tabular-nums text-white">{rank}</span>
      <span className="flex h-3 items-center gap-0.5 text-[10px] tabular-nums text-[var(--muted)]">
        {change > 0 && <ArrowUp className="h-2.5 w-2.5 text-[var(--periwinkle)]" />}
        {change < 0 && <ArrowDown className="h-2.5 w-2.5" />}
        {change !== 0 && Math.abs(change)}
      </span>
    </div>
  )
}
