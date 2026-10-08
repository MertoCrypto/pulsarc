import { clsx } from 'clsx'
import { Clock, ChevronDown } from 'lucide-react'
import { type TimeRange } from '@/hooks/useAppMetrics'
import { CATEGORIES } from '@/data/apps'

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last 1 Hour' },
  { value: '24h', label: 'Last 24 Hours' },
]

interface FilterBarProps {
  timeRange: TimeRange
  onTimeRangeChange: (v: TimeRange) => void
  category: string
  onCategoryChange: (v: string) => void
  hideCategories?: boolean
}

export function FilterBar({
  timeRange,
  onTimeRangeChange,
  category,
  onCategoryChange,
  hideCategories,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Time range */}
      <div className="relative">
        <select
          value={timeRange}
          onChange={e => onTimeRangeChange(e.target.value as TimeRange)}
          className="appearance-none pl-8 pr-8 py-2 text-[13px] font-medium text-[var(--text)] bg-transparent border border-[var(--line)] rounded-[10px] hover:border-[var(--line-strong)] transition-colors cursor-pointer focus:outline-none focus:border-[var(--periwinkle)]"
        >
          {TIME_RANGES.map(r => (
            <option key={r.value} value={r.value} className="bg-[#10213b]">{r.label}</option>
          ))}
        </select>
        <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40 pointer-events-none" />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40 pointer-events-none" />
      </div>

      {/* Category pills */}
      {!hideCategories && <div className="flex items-center gap-1 flex-wrap">
        {['All', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            data-active={category === cat}
            className="arc-chip"
          >
            {cat}
          </button>
        ))}
      </div>}
    </div>
  )
}
