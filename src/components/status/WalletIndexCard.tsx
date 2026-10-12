/**
 * WalletIndexCard — shows the coverage status of the Pulsarc wallet index.
 *
 * Wire into the /status page yourself:
 *   import { WalletIndexCard } from '@/components/status/WalletIndexCard'
 *   <WalletIndexCard net="testnet" />
 *
 * Returns null when meta.json is not published (404) or still loading with no data.
 */

import { useWalletIndexStatus } from '@/hooks/useWalletIndexStatus'

interface Props {
  net: 'mainnet' | 'testnet'
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="arc-card overflow-hidden">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <p className="arc-eyebrow">Wallet index</p>
      </div>
      <div className="space-y-2 px-5 py-4">
        <div className="arc-card h-9 animate-pulse" />
        <div className="arc-card h-5 animate-pulse" />
      </div>
    </div>
  )
}

// ── WalletIndexCard ───────────────────────────────────────────────────────────

export function WalletIndexCard({ net }: Props) {
  const { status, isLoading } = useWalletIndexStatus(net)

  // Show skeleton while the first fetch is in flight
  if (isLoading && status === null) return <LoadingSkeleton />

  // Hide the card when the index is not published (404) or parse failed
  if (status === null) return null

  const needsAttention = status.state !== 'ok'

  return (
    <div className="arc-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--line)] px-5 py-4">
        <p className="arc-eyebrow mb-1">Wallet index</p>
        <p
          className={`text-sm ${
            needsAttention ? 'text-amber-300' : 'text-[var(--muted)]'
          }`}
        >
          {status.text}
        </p>
      </div>

      {/* Detail row */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between">
          {/* Days-behind badge */}
          <span className="text-xs text-[var(--faint)]">
            {status.daysBehind <= 1
              ? 'Up to date (closed days only)'
              : `${status.daysBehind} days behind`}
          </span>

          {/* State indicator */}
          {needsAttention ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              {status.state === 'behind' ? 'behind' : 'gaps'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] opacity-60" />
              current
            </span>
          )}
        </div>
      </div>

      {/* Amber attention banner — shown when index needs attention */}
      {needsAttention && (
        <div className="border-t border-amber-300/[0.15] bg-amber-300/[0.05] px-5 py-3">
          <p className="text-xs text-amber-300/[0.80]">
            {status.state === 'behind'
              ? `Index is ${status.daysBehind} day${status.daysBehind === 1 ? '' : 's'} behind — data may be incomplete.`
              : 'Index has coverage gaps — some days may be missing.'}
          </p>
        </div>
      )}
    </div>
  )
}
