import { useId } from 'react'

export type MarkVariant = 'ring' | 'arch' | 'beacon'

interface Props {
  variant?: MarkVariant
  className?: string
  /** runs the beat: a light travels along the pulse line */
  animated?: boolean
  title?: string
  style?: React.CSSProperties
}

const PULSE = {
  ring: 'M3 24 H15.5 L19.5 14 L26 34 L30 24 H45',
  arch: 'M14.5 31 H19.5 L23 19 L27.5 37 L30.5 31 H33.5',
}

/**
 * The Pulsarc mark. `ring` is the primary: an orbit broken by a single beat.
 * Drawn on a 48-unit grid with round joins so it stays clean from 16px to poster size.
 */
export function PulsarcMark({ variant = 'ring', className, animated = false, title, style }: Props) {
  const id = useId().replace(/:/g, '')
  const grad = `pm-${id}`

  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} style={style} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={grad} x1="4" y1="24" x2="44" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="1" stopColor="#a9c4ea" />
        </linearGradient>
      </defs>

      {variant === 'ring' && (
        <>
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={animated ? 'pm-breathe' : undefined}>
            <path d="M7.66 19.31 A17 17 0 0 1 40.34 19.31" />
            <path d="M40.34 28.69 A17 17 0 0 1 7.66 28.69" />
          </g>
          <path d={PULSE.ring} stroke={`url(#${grad})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {animated && <path d={PULSE.ring} pathLength={100} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="pm-beat" />}
        </>
      )}

      {variant === 'arch' && (
        <>
          <path d="M8 41 C 8 20, 16 7, 24 7 C 32 7, 40 20, 40 41" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d={PULSE.arch} stroke="#a9c4ea" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {animated && <path d={PULSE.arch} pathLength={100} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="pm-beat" />}
        </>
      )}

      {variant === 'beacon' && (
        <>
          <circle cx="13" cy="35" r="3.2" fill="currentColor" />
          <g stroke="#a9c4ea" strokeWidth="2.4" strokeLinecap="round">
            <path d="M14.39 25.1 A10 10 0 0 1 22.9 33.61" className={animated ? 'pm-wave pm-wave-1' : undefined} />
            <path d="M15.5 17.18 A18 18 0 0 1 30.82 32.5" opacity={animated ? undefined : 0.72} className={animated ? 'pm-wave pm-wave-2' : undefined} />
            <path d="M16.61 9.26 A26 26 0 0 1 38.74 31.39" opacity={animated ? undefined : 0.44} className={animated ? 'pm-wave pm-wave-3' : undefined} />
          </g>
        </>
      )}
    </svg>
  )
}

/** Wordmark set in the display face; `arc` carries the accent. */
export function PulsarcWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-light tracking-[-0.02em] ${className}`}>
      Puls<span className="font-normal text-[var(--periwinkle)]">arc</span>
    </span>
  )
}
