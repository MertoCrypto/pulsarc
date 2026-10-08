import { type LucideIcon } from 'lucide-react'
import { useCountUp } from '@/hooks/useCountUp'

interface StatCardProps {
  label: string
  value: number
  format: (n: number) => string
  subValue?: string
  icon: LucideIcon
  accentColor?: string
  isLoading?: boolean
}

export function StatCard({
  label,
  value,
  format,
  subValue,
  icon: Icon,
  accentColor = '#a9c4ea',
  isLoading,
}: StatCardProps) {
  const animated = useCountUp(isLoading ? 0 : value)

  return (
    <div className="arc-card group overflow-hidden p-5 transition-colors hover:border-[var(--line-strong)]">
      <div
        className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full opacity-[0.16] blur-3xl transition-opacity duration-500 group-hover:opacity-[0.34]"
        style={{ backgroundColor: accentColor }}
      />
      <div className="relative flex items-start justify-between">
        <p className="arc-eyebrow">{label}</p>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full border transition-transform duration-500 group-hover:scale-110"
          style={{ borderColor: `${accentColor}55` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: accentColor }} />
        </div>
      </div>

      {isLoading ? (
        <div className="relative mt-5 h-10 w-32 animate-pulse rounded-lg bg-white/8" />
      ) : (
        <p className="relative mt-5 text-[38px] font-light leading-none tracking-tight tabular-nums text-white">
          {format(animated)}
        </p>
      )}

      {subValue && !isLoading && (
        <p className="relative mt-3 text-sm text-[var(--muted)]">{subValue}</p>
      )}
    </div>
  )
}
