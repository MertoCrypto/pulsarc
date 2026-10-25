import type { ReactNode } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import { domainName } from '@/lib/bridgeFlow'
import { topChains, type CctpStats } from '@/lib/cctpLive'
import { pillAmount } from '@/lib/orbitMap'
import { PortFace } from './portIcons'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
/** "$0" for nothing, otherwise a short amount such as "$5.2K". */
export const usdcLabel = (n: number) => (n > 0 ? pillAmount(n) : '$0')

interface CounterProps {
  blocks: number
  txs: number
  latest: number | null
  share: number | null
  skipped: number
  error: string | null
  className?: string
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">{label}</dt>
      <dd className="mt-0.5 font-['Geist_Mono'] text-[20px] font-light leading-tight text-white">{children}</dd>
    </div>
  )
}

/** Bottom-left glass panel: live counters that ease toward each new value. */
export function CounterPanel({ blocks, txs, latest, share, skipped, error, className = '' }: CounterProps) {
  const blocksShown = useCountUp(blocks, 700)
  const txsShown = useCountUp(txs, 700)
  const shareShown = useCountUp(share ?? 0, 900)
  return (
    <div className={`om-glass p-4 ${className}`}>
      <p className="flex items-center gap-2 font-['Geist_Mono'] text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${error ? 'bg-[#ff7a8a]' : 'bg-[#5ee6a8]'} opacity-60`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${error ? 'bg-[#ff7a8a]' : 'bg-[#5ee6a8]'}`} />
        </span>
        {error ? 'Arc RPC unreachable. Retrying.' : 'Live from Arc RPC'}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
        <Stat label="Blocks seen">{fmt(blocksShown)}</Stat>
        <Stat label="Transactions">{fmt(txsShown)}</Stat>
        <Stat label="Latest block">{latest === null ? 'Waiting' : fmt(latest)}</Stat>
        <Stat label="To tracked apps">{share === null ? '–' : `${Math.round(shareShown)}%`}</Stat>
      </dl>
      {skipped > 0 && (
        <p className="mt-3 font-['Geist_Mono'] text-[10px] text-[var(--faint)]">{`${fmt(skipped)} blocks skipped to keep up`}</p>
      )}
    </div>
  )
}

/** Bottom-right glass panel: USDC crossing between Arc and other networks since the page opened. */
export function CctpPanel({ stats, className = '' }: { stats: CctpStats; className?: string }) {
  const moved = stats.inCount + stats.outCount
  const top = topChains(stats, 3)
  return (
    <div className={`om-glass p-4 ${className}`}>
      <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Crossing into Arc since you opened</p>
      {moved === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--faint)]">Waiting for the first CCTP transfer…</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-6">
            <Stat label="USDC in">{usdcLabel(stats.inUsdc)}</Stat>
            <Stat label="USDC out">{usdcLabel(stats.outUsdc)}</Stat>
          </dl>
          {top.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {top.map(c => (
                <li key={c.domain} className="flex items-center gap-2 text-[13px] text-[var(--text)]">
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[rgba(14,33,64,0.9)]">
                    <PortFace domain={c.domain} size={24} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{domainName(c.domain)}</span>
                  <span className="font-['Geist_Mono'] text-[12px] text-[var(--periwinkle)]">{usdcLabel(c.usdc)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}

interface LegendProps {
  motionOn: boolean
  reduced: boolean
  onToggle: () => void
  className?: string
}

/** Legend chips and the Motion toggle. */
export function Legend({ motionOn, reduced, onToggle, className = '' }: LegendProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="om-chip"><span className="h-2.5 w-3 rounded-[3px] border border-[rgba(169,196,234,0.7)]" aria-hidden />Apps</span>
      <span className="om-chip"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-[rgba(169,196,234,0.8)]" aria-hidden />Other networks</span>
      <span className="om-chip"><span className="h-2.5 w-2.5 rounded-full border border-[rgba(169,196,234,0.7)]" aria-hidden />Pulse = new block</span>
      <span className="om-chip"><span className="h-0.5 w-4 rounded-full bg-[linear-gradient(90deg,transparent,#dfeaff)]" aria-hidden />Bright comet = bridge move</span>
      <button type="button" className="om-chip" aria-pressed={motionOn} onClick={onToggle} disabled={reduced}>
        {reduced ? 'Motion reduced' : `Motion ${motionOn ? 'on' : 'off'}`}
      </button>
    </div>
  )
}
