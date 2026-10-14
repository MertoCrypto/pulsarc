import { clsx } from 'clsx'
import { useState } from 'react'
import {
  ShieldCheck,
  ArrowLeftRight,
  Layers,
  Fingerprint,
  MessageSquare,
  Repeat,
  Coins,
  Landmark,
  Bot,
  Box,
  CircuitBoard,
  TrendingUp,
  Send,
  type LucideProps,
} from 'lucide-react'
import { TokenBTC, TokenEURC, TokenUSDC } from '@web3icons/react'
import { glyphFor, type GlyphKey } from '@/lib/appGlyph'


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
  /** app category — used to pick a generic glyph when no logo is available */
  category?: string
  /** app id — used for per-id glyph overrides (higher priority than category) */
  appId?: string
  size?: 'sm' | 'md' | 'lg'
}

const PX = { sm: 28, md: 36, lg: 44 }

/** Map from GlyphKey string → lucide component (no brand imitation; all generic). */
const GLYPH_COMPONENTS: Record<GlyphKey, React.ComponentType<LucideProps>> = {
  'arrows-left-right': ArrowLeftRight,
  'layers':            Layers,
  'fingerprint':       Fingerprint,
  'message-square':    MessageSquare,
  'repeat':            Repeat,
  'coins':             Coins,
  'landmark':          Landmark,
  'bot':               Bot,
  'box':               Box,
  'circuit-board':     CircuitBoard,
  'trending-up':       TrendingUp,
  'send':              Send,
}

export function AppLogoBadge({ initials, logo, logoIcon, category, appId, size = 'md' }: AppLogoBadgeProps) {
  const [broken, setBroken] = useState(false)
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
  const inner = Math.round(PX[size] * 0.74)

  // Determine what to render in the circle, in descending priority:
  //   1. web3icon token logo (usdc / eurc / btc)
  //   2. self-hosted image (if not broken)
  //   3. lucide glyph derived from id/category
  //   4. (never reached — glyph always resolves to at least 'box')
  const glyphKey = glyphFor(appId, category)
  const GlyphIcon = GLYPH_COMPONENTS[glyphKey]

  // Icon pixel sizes that feel right at each badge size (≈58 % of the circle)
  const glyphSize = size === 'sm' ? 13 : size === 'lg' ? 20 : 16

  const useGlyph = !logoIcon && !(logo && !broken)

  return (
    <div
      aria-label={initials}
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
        ) : useGlyph ? (
          <>
            <GlyphIcon aria-hidden="true" size={glyphSize} strokeWidth={1.6} />
            <span className="sr-only">{initials}</span>
          </>
        ) : initials}
    </div>
  )
}
