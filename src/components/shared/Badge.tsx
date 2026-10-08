import { clsx } from 'clsx'
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { TokenBTC, TokenEURC, TokenUSDC } from '@web3icons/react'


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
  /** image URL, e.g. from Arc Portal */
  logo?: string
  /** shared token icon for Circle-issued assets */
  logoIcon?: 'usdc' | 'eurc' | 'btc'
  size?: 'sm' | 'md' | 'lg'
}

const PX = { sm: 28, md: 36, lg: 44 }

export function AppLogoBadge({ initials, logo, logoIcon, size = 'md' }: AppLogoBadgeProps) {
  const [broken, setBroken] = useState(false)
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
  const inner = Math.round(PX[size] * 0.74)
  return (
    <div
      className={clsx(
        'flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--line-strong)] font-medium tracking-wide text-[var(--periwinkle)]',
        (logo && !broken) || logoIcon ? 'bg-[#0e2140]' : '',
        sizeClass,
      )}
    >
      {logoIcon === 'usdc' ? <TokenUSDC variant="branded" size={inner} />
        : logoIcon === 'eurc' ? <TokenEURC variant="branded" size={inner} />
        : logoIcon === 'btc' ? <TokenBTC variant="branded" size={inner} />
        : logo && !broken ? (
          <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : initials}
    </div>
  )
}
