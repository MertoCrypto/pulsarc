/**
 * Gas report card for the wallet page.
 * Accepts a pre-computed GasReport (from src/lib/walletGas.ts) and renders it
 * with no additional network calls.
 */

import type { GasReport } from '@/lib/walletGas'
import { formatGasUsd } from '@/lib/walletGas'

// ── Local Fact tile (same markup as WalletProfile.tsx — not exported from there) ─

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="arc-eyebrow !text-[10px]">{label}</p>
      <p className="mt-2 text-[28px] font-light leading-none tracking-tight tabular-nums text-white">
        {value}
      </p>
    </div>
  )
}

// ── SmallFact: secondary row tiles ────────────────────────────────────────────

function SmallFact({
  label,
  value,
  style,
}: {
  label: string
  value: string
  style?: React.CSSProperties
}) {
  return (
    <div>
      <p className="arc-eyebrow !text-[10px]">{label}</p>
      <p
        className="mt-1.5 text-[22px] font-light leading-none tracking-tight tabular-nums"
        style={style ?? { color: 'var(--text)' }}
      >
        {value}
      </p>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}

// ── WalletGasCard ─────────────────────────────────────────────────────────────

interface Props {
  report: GasReport
}

export function WalletGasCard({ report }: Props) {
  const {
    fees,
    sent,
    reverted,
    revertedShare,
    avgFee,
    feePerActiveDay,
    netUsdc,
    direction,
    partial,
    nonceAhead,
    ok,
  } = report

  // ── Net USDC display ─────────────────────────────────────────────────────────

  const netSign = netUsdc > 0 ? '+' : ''
  const netColor =
    direction === 'in'
      ? 'var(--positive)'
      : direction === 'out'
      ? 'var(--negative)'
      : 'var(--muted)'
  const netLabel =
    direction === 'in'
      ? 'more came in'
      : direction === 'out'
      ? 'more went out'
      : 'balanced'
  const netDisplay = `${netSign}${formatGasUsd(netUsdc)} · ${netLabel}`

  // ── Reverted tile value ──────────────────────────────────────────────────────

  const revertedDisplay =
    revertedShare != null
      ? `${reverted.toLocaleString('en-US')} · ${pct(revertedShare)}`
      : reverted.toLocaleString('en-US')

  // ── OK / reverted share bar ──────────────────────────────────────────────────

  const okShare = sent > 0 ? ok / sent : 1
  const badShare = sent > 0 ? reverted / sent : 0
  // sr-only equivalent text
  const barText =
    sent > 0
      ? `${pct(okShare)} successful, ${pct(badShare)} reverted`
      : 'No transactions'

  return (
    <section className="arc-card p-6 sm:p-8">
      {/* Header */}
      <p className="arc-eyebrow mb-6">Gas report · paid in USDC</p>

      {/* Primary tile row */}
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Fact label="Total gas" value={formatGasUsd(fees)} />
        <Fact label="Transactions sent" value={sent.toLocaleString('en-US')} />
        <Fact label="Reverted" value={revertedDisplay} />
        <Fact
          label="Average per transaction"
          value={avgFee != null ? formatGasUsd(avgFee) : '—'}
        />
      </div>

      {/* Success / revert bar */}
      <div className="mt-6">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'rgba(255,122,138,0.70)' }}
          role="img"
          aria-label={barText}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${(okShare * 100).toFixed(2)}%`,
              background: 'var(--periwinkle)',
            }}
          />
        </div>
        <span className="sr-only">{barText}</span>
      </div>

      {/* Secondary row */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <SmallFact
          label="Net USDC flow"
          value={netDisplay}
          style={{ color: netColor }}
        />
        <SmallFact
          label="Gas per active day"
          value={feePerActiveDay != null ? formatGasUsd(feePerActiveDay) : '—'}
        />
      </div>

      {/* Footnotes */}
      <div className="mt-5 space-y-1.5 text-xs" style={{ color: 'var(--faint)' }}>
        <p>On Arc the network fee is paid in USDC, so this is the wallet's real gas spend.</p>
        {partial && (
          <p>Counts and fees cover only the live-indexing period.</p>
        )}
        {nonceAhead != null && nonceAhead > 0 && (
          <p>
            {partial
              ? <>The live node counts {nonceAhead.toLocaleString('en-US')} more sent transaction{nonceAhead === 1 ? '' : 's'} than the index covers.</>
              : <>The live node shows {nonceAhead.toLocaleString('en-US')} more sent transaction{nonceAhead === 1 ? '' : 's'} than the index (usually today's, not indexed yet).</>
            }
          </p>
        )}
      </div>
    </section>
  )
}
