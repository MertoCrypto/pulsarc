import type { ReactNode } from 'react'

interface MainnetPendingProps {
  title: string
  children?: ReactNode
}

/**
 * Shown in place of ArcScan-dependent data sections when the app is running
 * on Arc Mainnet (NETWORK.id === 5042). ArcScan does not expose a
 * browser-accessible mainnet API yet, so these sections are unavailable.
 */
export function MainnetPending({ title, children }: MainnetPendingProps) {
  return (
    <div className="arc-card px-8 py-14 text-center">
      <p className="arc-eyebrow mb-5">{title}</p>
      <p className="mx-auto max-w-[480px] text-lg font-light leading-relaxed text-[var(--muted)]">
        This data is not available on Arc Mainnet yet.
      </p>
      {children && (
        <p className="mx-auto mt-4 max-w-[480px] text-sm leading-relaxed text-[var(--faint)]">
          {children}
        </p>
      )}
    </div>
  )
}
