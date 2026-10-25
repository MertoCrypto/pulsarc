import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { ArcApp } from '@/data/apps'
import type { RankedApp } from '@/hooks/useAllMetrics'
import { domainName } from '@/lib/bridgeFlow'
import { EXTRA_CHAIN_NAMES } from '@/lib/chainPorts'
import type { PortStat } from '@/lib/cctpLive'
import type { ChainSize } from '@/lib/chainSizes'
import { CATEGORY_COLORS } from '@/lib/orbitMap'
import { usdcLabel } from './OrbitHud'
import { PortFace } from './portIcons'

export type Selection = { kind: 'app'; id: string } | { kind: 'port'; domain: number }

const fmt = (n: number) => n.toLocaleString('en-US')

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--faint)]">{label}</dt>
      <dd className="mt-0.5 font-['Geist_Mono'] text-lg text-white">{value}</dd>
    </div>
  )
}

interface Props {
  selection: Selection
  app: ArcApp | null
  metrics: RankedApp['metrics'] | undefined
  liveSeen: number
  port: PortStat | undefined
  portSize: ChainSize | null | undefined
  onClose: () => void
}

/** Glass side panel (desktop) / bottom sheet (mobile) for the selected app or network. */
export const OrbitPanel = forwardRef<HTMLButtonElement, Props>(function OrbitPanel(
  { selection, app, metrics, liveSeen, port, portSize, onClose }, closeRef,
) {
  const stat: PortStat = port ?? { inCount: 0, outCount: 0, inUsdc: 0, outUsdc: 0 }
  const label = selection.kind === 'app'
    ? app?.name ?? 'App'
    : (EXTRA_CHAIN_NAMES[selection.domain] ?? domainName(selection.domain))
  return (
    <aside
      aria-label={`${label} details`}
      className="om-glass om-glass--flat absolute inset-x-0 bottom-0 z-[70] max-h-[78%] overflow-y-auto rounded-b-none p-5 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[330px] sm:rounded-b-2xl"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--muted)] transition-colors hover:text-white"
      >
        <X size={18} />
      </button>

      {selection.kind === 'app' && app && (
        <>
          <p className="flex items-center gap-2 font-['Geist_Mono'] text-[11px] text-[var(--muted)]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[app.category] }} />
            {app.category}
          </p>
          <h2 className="mt-2 pr-8 text-2xl font-light text-white">{app.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{app.description}</p>
          <dl className="mt-5 grid grid-cols-1 gap-3">
            <Stat label="Transactions, 24h" value={metrics ? fmt(metrics.txCount) : 'Loading'} />
            <Stat label="Active wallets, 24h" value={metrics ? fmt(metrics.activeWallets) : 'Loading'} />
            <Stat label="Live txs seen since you opened the page" value={fmt(liveSeen)} />
          </dl>
          <Link to={`/dapp/${app.id}`} className="mt-5 inline-block text-sm text-[var(--periwinkle)] underline-offset-4 hover:underline">
            {`Open ${app.name}`}
          </Link>
        </>
      )}

      {selection.kind === 'port' && (
        <>
          <div className="flex items-center gap-3 pr-8">
            <span className="om-face h-12 w-12 shrink-0 rounded-full">
              <PortFace domain={selection.domain} size={48} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-light text-white">{label}</h2>
              <p className="font-['Geist_Mono'] text-[11px] text-[var(--muted)]">{selection.domain > 0 ? `Domain ${selection.domain}` : label}</p>
            </div>
          </div>
          {portSize && (portSize.assets !== null || portSize.dex24h !== null) && (
            <dl className="mt-4 grid grid-cols-2 gap-3">
              {portSize.assets !== null && (
                <Stat label="In DeFi apps" value={fmtUsd(portSize.assets)} />
              )}
              {portSize.dex24h !== null && (
                <Stat label="DEX volume 24h" value={fmtUsd(portSize.dex24h)} />
              )}
            </dl>
          )}
          <dl className="mt-4 grid grid-cols-1 gap-3">
            <Stat label="USDC in, since you opened the page" value={`${usdcLabel(stat.inUsdc)} · ${fmt(stat.inCount)} ${stat.inCount === 1 ? 'transfer' : 'transfers'}`} />
            <Stat label="USDC out, since you opened the page" value={`${usdcLabel(stat.outUsdc)} · ${fmt(stat.outCount)} ${stat.outCount === 1 ? 'transfer' : 'transfers'}`} />
          </dl>
          <p className="mt-5 text-sm leading-relaxed text-[var(--faint)]">Counts start when you open this page.</p>
        </>
      )}
    </aside>
  )
})
