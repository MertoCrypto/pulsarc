/**
 * WalletPercentiles — shows where a wallet stands among all wallets
 * Pulsarc has indexed, using the 101-boundary quantile distribution.
 *
 * Renders nothing (returns null) while loading, on error, when the
 * distribution has not been published yet (data is null/undefined),
 * or when no metric lines are available for the given summary.
 *
 * Wire-in example:
 *   <WalletPercentiles net={net} summary={summary} />
 */
import { useWalletDist } from '@/hooks/useWalletDist'
import { describe } from '@/lib/walletDist'
import type { DescribeLine } from '@/lib/walletDist'
import { dayToDate } from '@/lib/walletIndex'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SummaryInput {
  activeDays: number
  tx: number
  usdcSent: number
  usdcReceived: number
  partial: boolean
}

interface WalletPercentilesProps {
  net: 'mainnet' | 'testnet'
  summary: SummaryInput
}

// ── Component ──────────────────────────────────────────────────────────────────

export function WalletPercentiles({ net, summary }: WalletPercentilesProps) {
  const { data, isLoading, isError } = useWalletDist(net)

  // Render nothing while loading, on error, or when the dist is not available
  if (isLoading || isError || data == null) return null

  const lines: DescribeLine[] = describe(data, summary)

  // Render nothing when no lines are available for this summary
  if (lines.length === 0) return null

  // `through` is a day number relative to 2026-01-01 UTC
  const throughDate = dayToDate(data.through).toISOString().slice(0, 10)

  return (
    <section className="arc-card p-6 sm:p-8">
      <p className="arc-eyebrow mb-4 !text-[10px]">Compared with indexed wallets</p>

      <dl className="space-y-4">
        {lines.map(line => (
          <div key={line.label}>
            <dt className="text-xs text-[var(--muted)]">{line.label}</dt>
            <dd className="mt-0.5 text-sm text-white">{line.text}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-xs text-[var(--faint)]">
        Estimated from 101 boundary values over every wallet in Pulsarc&apos;s index
        (closed days through {throughDate} UTC); not a score.
      </p>
    </section>
  )
}
