import { clsx } from 'clsx'
import { ShieldCheck } from 'lucide-react'


interface CategoryBadgeProps {
  category: string
  size?: 'xs' | 'sm' | 'md'
}

export function CategoryBadge({ category, size = 'sm' }: CategoryBadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center font-[\'Geist_Mono\'] uppercase text-[var(--muted)]',
      size === 'xs' ? 'text-[9px] tracking-[0.14em]' : size === 'sm' ? 'text-[10px] tracking-[0.16em]' : 'text-xs tracking-[0.16em]',
    )}>
      {category}
    </span>
  )
}

interface VerifiedBadgeProps {
  size?: 'sm' | 'md'
}

export function VerifiedBadge({ size = 'sm' }: VerifiedBadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[var(--periwinkle)]',
      size === 'sm' ? 'text-[11px]' : 'text-xs',
    )}>
      <ShieldCheck className={clsx(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      Verified
    </span>
  )
}

interface AppLogoBadgeProps {
  initials: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
}

export function AppLogoBadge({ initials, size = 'md' }: AppLogoBadgeProps) {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
  return (
    <div
      className={clsx(
        'flex flex-shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] font-medium tracking-wide text-[var(--periwinkle)]',
        sizeClass,
      )}
    >
      {initials}
    </div>
  )
}
