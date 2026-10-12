/**
 * OwnerActivityCard — "Owner wallet activity" card for the Agents page.
 *
 * Wire it into Agents.tsx yourself:
 *   import { OwnerActivityCard } from '@/components/agents/OwnerActivityCard'
 *   <OwnerActivityCard net="testnet" />
 */

import { useAgentsActivity } from '@/hooks/useAgentsActivity'
import {
  isActivityFresh,
  summarize,
  shortOwner,
  explorerAddressUrl,
} from '@/lib/agentsActivity'
import { formatUsdc } from '@/lib/balances'
import { DownloadMenu } from '@/components/shared/DownloadMenu'

interface Props {
  net: 'mainnet' | 'testnet'
}

export function OwnerActivityCard({ net }: Props) {
  const { data, isLoading, error } = useAgentsActivity(net)

  // Return nothing while loading, on error, when data is absent, or when stale.
  if (isLoading) return null
  if (error) return null
  if (data === null || data === undefined) return null
  if (!isActivityFresh(data)) return null

  const { ownersLine, measuredLine, idleLine } = summarize(data)

  // Top 8 for display
  const displayRows = data.top.slice(0, 8)

  // Full top array for CSV export
  const csvRows = data.top.map(row => ({
    owner: row.owner,
    agents: row.agents,
    'transactions sent': row.txCount,
    'USDC held': row.usdc,
    'first agent id': row.firstId,
  }))

  return (
    <div className="arc-card px-5 py-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="arc-eyebrow mb-1">Owner wallet activity</p>
          <p className="text-[17px] font-light leading-snug text-white">
            {ownersLine}
          </p>
        </div>

        <DownloadMenu
          page="agent-owner-activity"
          net={net}
          source="Pulsarc indexer, agents-activity.json"
          columns={[
            { key: 'owner', label: 'owner' },
            { key: 'agents', label: 'agents' },
            { key: 'transactions sent', label: 'transactions sent' },
            { key: 'USDC held', label: 'USDC held' },
            { key: 'first agent id', label: 'first agent id' },
          ]}
          rows={csvRows}
        />
      </div>

      {/* Muted context lines */}
      {(measuredLine !== null || idleLine !== null) && (
        <div className="space-y-1">
          {measuredLine !== null && (
            <p className="text-sm text-[var(--muted)]">{measuredLine}</p>
          )}
          {idleLine !== null && (
            <p className="text-sm text-[var(--muted)]">{idleLine}</p>
          )}
        </div>
      )}

      {/* Top-owner rows */}
      {displayRows.length > 0 && (
        <ul className="space-y-3">
          {displayRows.map(row => (
            <li
              key={row.owner}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5"
            >
              {/* Left: address link + first name */}
              <div className="min-w-0">
                <a
                  href={explorerAddressUrl(net, row.owner)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-['Geist_Mono'] text-[11px] text-[var(--muted)] hover:text-white transition-colors"
                >
                  {shortOwner(row.owner)}
                </a>
                {row.names[0] !== undefined && (
                  <span className="ml-2 truncate text-xs text-[var(--faint)]">
                    {row.names[0]}
                  </span>
                )}
              </div>

              {/* Right: stats */}
              <div className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5">
                <span className="text-xs tabular-nums text-[var(--muted)] whitespace-nowrap">
                  {new Intl.NumberFormat('en-US').format(row.agents)} agents
                </span>
                <span className="text-xs tabular-nums text-[var(--muted)] whitespace-nowrap">
                  {new Intl.NumberFormat('en-US').format(row.txCount)} transactions sent
                </span>
                <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-['Geist_Mono'] text-[11px] text-[var(--muted)] whitespace-nowrap">
                  {formatUsdc(row.usdc)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Footnote */}
      <p className="text-xs text-[var(--faint)]">
        Measured on the owner wallet of each registered agent: an agent may
        transact from a different wallet that is not visible here. Transactions
        sent is the wallet's lifetime count.
      </p>
    </div>
  )
}
